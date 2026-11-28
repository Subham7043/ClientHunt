# ClientHunt AI — Firestore Security Specification

## 1. Data Invariants

1. **No Self-Assigned Admin**: Users registering in `/users/{userId}` may only create profiles with `role` in `['student', 'freelancer', 'business']`. Role escalation to `'admin'` is strictly rejected by rules. Admin status requires either a verified bootstrapped admin email (`email_verified == true`) or an entry in `/admins/{uid}`.
2. **PII & Student Profile Isolation**:
   - `/users/{userId}` documents contain private emails and are readable only by `owner` (`request.auth.uid == userId`) or `isAdmin()`.
   - `/studentProfiles/{userId}` documents contain private academic/income-range records and are strictly readable/writable only by `owner` or `isAdmin()`. Sensitive national IDs (e.g., Aadhaar) and banking credentials are never collected or permitted.
3. **Owner-Scoped Discovery, Job & Scholarship Workspace**:
   - `/leads`, `/opportunities`, `/leadAnalyses`, `/savedLeads`, `/crmPipelines`, `/crmActivities`, `/pitchDrafts`, `/savedJobs`, `/jobApplications`, `/jobAlerts`, `/savedScholarships`, `/scholarshipApplications`, `/scholarshipReminders`, and `/notificationPreferences` are strictly readable and writable only by their `ownerId` (or `isAdmin()`).
4. **Source Verification & Moderation Boundaries**:
   - `/scholarships/{scholarshipId}`: Only `Verified` scholarships are readable by general users; non-verified submissions are visible only to their submitting `ownerId` or `isAdmin()`. Non-admins cannot self-assign `sourceVerificationStatus == 'Verified'`.
   - `/jobs/{jobId}`: Active curated jobs or owner-saved jobs are readable by signed-in users; only the owning `ownerId` or `isAdmin()` can modify or mark expired/removed.
5. **Marketplace Authorization**:
   - `/projects`: Published projects (`status == 'Published'`) are publicly readable; Draft/Paused/Closed/Completed projects are readable only by `businessId` or `isAdmin()`.
   - `/proposals`: Readable only by `freelancerId`, `businessId`, or `isAdmin()`. State transitions remain strictly bounded.
6. **Master Gate Conversations**: `/conversations/{cid}/messages/{mid}` uses `get()` on `/conversations/{cid}` to verify sender membership (`businessId` or `freelancerId`).
7. **Temporal & Immutable Integrity**: All `createdAt` and `updatedAt` timestamps are enforced via `request.time`.

## 2. Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Admin Self-Escalation**: `POST /users/attacker` with `{ role: "admin", ... }`
2. **Role Mutation on Update**: `PATCH /users/user1` changing `role` from `"student"` to `"admin"`
3. **Shadow Field Injection**: `POST /studentProfiles/s1` adding `"aadhaarNumber"` or `"bankPassword"`
4. **Cross-User Student PII Read**: `GET /studentProfiles/victimUid` as `attackerUid`
5. **Scholarship Verification Spoofing**: Non-admin creating `/scholarships/s1` with `sourceVerificationStatus: "Verified"`
6. **Cross-User Scholarship Tracker Read**: `GET /scholarshipApplications/app1` belonging to another student
7. **Unverified Email Write**: Creating `/jobApplications/j1` with `request.auth.token.email_verified == false`
8. **Freelancer Self-Accepting Proposal**: `PATCH /proposals/prop1` as `freelancerId` setting `status: "Accepted"`
9. **Conversation Eavesdropping**: `GET /conversations/c1/messages/m1` by a third user
10. **CRM Query Scraping**: `LIST /crmPipelines` without `where('ownerId', '==', auth.uid)`
11. **ID Poisoning**: Creating `/savedScholarships/<1500-char-junk-id>` violating `isValidId()`
12. **Audit Log Tampering**: Non-admin creating or updating `/auditLogs/{id}`
