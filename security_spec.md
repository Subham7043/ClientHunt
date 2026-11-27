# ClientHunt AI — Firestore Security Specification (Phase 0)

## 1. Data Invariants

1. **No Self-Assigned Admin**: Users registering in `/users/{userId}` may only create profiles with `role` in `['freelancer', 'business']`. Role escalation to `'admin'` is strictly rejected by rules. Admin status requires either a verified bootstrapped admin email (`email_verified == true`) or an entry in `/admins/{uid}`.
2. **PII Isolation**: `/users/{userId}` documents contain private emails and are readable only by `owner` (`request.auth.uid == userId`) or `isAdmin()`.
3. **Owner-Scoped Discovery & CRM**: `/leads`, `/opportunities`, `/leadAnalyses`, `/savedLeads`, `/crmPipelines`, `/crmActivities`, `/pitchDrafts`, and `/notificationPreferences` are strictly readable and writable only by their `ownerId` (or `isAdmin()`).
4. **Marketplace Authorization**:
   - `/projects`: Published projects (`status == 'Published'`) are publicly readable; Draft/Paused/Closed/Completed projects are readable only by the owning `businessId` or `isAdmin()`. Only verified businesses may create projects with `businessId == request.auth.uid`.
   - `/proposals`: Readable only by the submitting `freelancerId`, the target project's `businessId`, or `isAdmin()`. Creating a proposal requires `exists(/projects/{projectId})` and `get(/projects/{projectId}).data.status == 'Published'`. Freelancers can only withdraw their own proposals; businesses can only transition status to `['Viewed', 'Shortlisted', 'Accepted', 'Rejected']`.
5. **Master Gate Conversations**: `/conversations/{cid}/messages/{mid}` uses `get()` on the parent `/conversations/{cid}` document to verify the sender is either `businessId` or `freelancerId`, and `senderId == request.auth.uid`.
6. **Temporal & Immutable Integrity**: All `createdAt` and `updatedAt` timestamps are enforced via `request.time`. Immutable owner/parent IDs cannot be altered on updates.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Admin Self-Escalation**: `POST /users/attacker` with `{ role: "admin", ... }`
2. **Role Mutation on Update**: `PATCH /users/user1` changing `role` from `"freelancer"` to `"admin"`
3. **Shadow Field Injection**: `POST /users/user1` adding undeclared `"isVerifiedAdmin": true`
4. **Cross-User PII Read**: `GET /users/victimUid` as `attackerUid`
5. **Unverified Email Write**: Creating `/projects/p1` with `request.auth.token.email_verified == false`
6. **Admin Email Spoof**: Accessing `/auditLogs` with admin email claim when `email_verified == false`
7. **Orphaned Proposal Creation**: `POST /proposals/prop1` referencing non-existent `projectId: "fake_id"`
8. **Freelancer Self-Accepting Proposal**: `PATCH /proposals/prop1` as `freelancerId` setting `status: "Accepted"`
9. **Terminal State Bypass on Proposal**: Updating a proposal whose existing `status` is `"Accepted"` or `"Rejected"` as non-admin
10. **Conversation Eavesdropping**: `GET /conversations/c1/messages/m1` by a third user not matching `businessId` or `freelancerId`
11. **CRM Query Scraping**: `LIST /crmPipelines` without `where('ownerId', '==', auth.uid)`
12. **ID Poisoning**: Creating `/savedLeads/<1500-char-junk-id>` violating `isValidId()`
