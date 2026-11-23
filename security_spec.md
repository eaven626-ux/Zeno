# Security Specification — Barqiyah Messaging

## 1. Data Invariants
1. **PII Isolation**: User email addresses and private preferences live exclusively in `/users_private/{userId}` and are readable/writable only by `request.auth.uid == userId`. `/users_public/{userId}` contains zero PII.
2. **Identity Integrity**: Every document created with `uid`, `ownerId`, `senderId`, or `createdBy` must strictly match `request.auth.uid` on creation and remain immutable afterward.
3. **Master Gate Membership**: Access to private chat metadata, members, messages, reactions, and poll votes is gated by `/chats/{chatId}/members/{request.auth.uid}` (or `isPublic == true` for public channels/groups).
4. **Channel Broadcast Constraint**: In `channel` type chats, only users with `role == 'owner'` or `role == 'admin'` in `/chats/{chatId}/members/{request.auth.uid}` can send, edit, or delete messages; regular members can read, react, and vote in polls.
5. **Temporal Integrity**: All `createdAt`, `updatedAt`, `joinedAt`, `lastSeen`, and `editedAt` server-validated timestamps must equal `request.time`.
6. **Strict Schema & Bounds**: Every document enforces `keys().hasAll(...)` and `keys().hasOnly(...)` on creation, `affectedKeys().hasOnly(...)` on action-based updates, regex-validated IDs (`^[a-zA-Z0-9_\-]+$`), and explicit `.size()` bounds on all strings and bounded lists.
7. **User Blocking Integrity**: Only `blockerUid == request.auth.uid` can create or delete `/user_blocks/{blockerUid}_{blockedUid}`. Direct chats reject new messages, file chunks, reactions, and DM creation when either participant has blocked the other.
8. **Mutual Direct Chat Deletion**: Both verified members of a `direct` chat may permanently delete messages and purge the direct chat (and its peer sidebar entry) between both parties, while never allowing non-members or non-DM chats to delete another user's sidebar items.
9. **Disappearing Messages Integrity**: Private (`direct` and `saved`) chats may configure `autoDeleteSeconds` (`0` or `5 <= val <= 2592000`), changeable only by active non-blocked chat members. Messages may carry an immutable `ttlSeconds` (`5 <= val <= 2592000`) anchored to server `createdAt`.
10. **Custom Sticker Pack Ownership**: `/sticker_packs/{packId}` and `/sticker_packs/{packId}/stickers/{stickerId}` are strictly scoped to `ownerId == request.auth.uid`, enforce bounded payload sizes (`<= 750KB` per sticker, `stickerCount <= 50`), and require parent pack ownership via Master Gate `get()`/`getAfter()`.

## 2. "Dirty Dozen" Adversarial Payloads (Must All Be Denied)
1. **Identity Spoofing on Public User**: Create `/users_public/victim_uid` while signed in as `attacker_uid`.
2. **PII Blanket Read**: Read `/users_private/victim_uid` or list `/users_private` as `attacker_uid`.
3. **Ghost Field Injection (Shadow Update)**: Create `/users_public/attacker_uid` with extra field `isAdmin: true`.
4. **Sender Spoofing in Message**: Create `/chats/chat1/messages/msg1` with `senderId: "victim_uid"` while signed in as `attacker_uid`.
5. **Channel Unauthorized Post**: Regular member (`role: 'member'`) creating a message in a `channel` chat.
6. **Private Chat Message Eavesdropping**: Non-member querying `/chats/private_chat/messages`.
7. **Timestamp Forgery**: Create message with `createdAt` set to a past client timestamp instead of `request.time`.
8. **ID Poisoning**: Create a document with a 300-character ID or invalid characters (`../admin`).
9. **Resource Exhaustion (Oversized Text)**: Create a message with `text` exceeding 4,000 characters.
10. **Immutable Field Mutation**: Update a message to change `senderId` or `createdAt` or `chatId`.
11. **Self-Assigned Admin Role**: Member updating their own `/chats/{chatId}/members/{uid}` document to `role: 'owner'`.
12. **Unverified Email Write**: Attempt any write when `request.auth.token.email_verified != true`.
13. **Blocked DM Bypass / Forged Unblock**: Sending a message in a DM where the recipient has blocked the sender, or deleting someone else's `/user_blocks/{victim}_{attacker}` record.
14. **Timer Bounds & TTL Tampering**: Setting `autoDeleteSeconds` to `-5` or `99999999`, changing `autoDeleteSeconds` while blocked, or mutating `ttlSeconds` on an existing message.
15. **Sticker Pack Spoofing / Oversized Sticker**: Creating a custom sticker inside another user's `/sticker_packs/{victimPackId}/stickers/{id}` or sending a `sticker` message with an unsupported `stickerAnim` value.

## 3. Test Verification Matrix (`firestore.rules.test.ts` Spec)
All dirty dozen payloads must return `PERMISSION_DENIED` when evaluated against `firestore.rules`:
- `users_public`: owner-only create/update with `hasOnly`, non-PII reads only for verified signed-in users.
- `users_private`: owner-only get/create/update, `list` denied globally.
- `user_blocks`: scoped by `blockerUid == request.auth.uid` on create/delete; `get`/`list` limited to blocker or blocked participant.
- `chats`: creation requires `ownerId == request.auth.uid`; updates split into explicit actions (`updateInfo`, `updateLastMessage`, `pinMessage`, `updateMemberCount`); deletes allowed for owner or direct chat participants.
- `chats/{chatId}/members`: owner/admin management, self-join only for public chats as `member`, self-update only for `typingAt` and `lastReadAt`.
- `chats/{chatId}/messages`: sender-verified create blocked when `isDirectBlocked`, channel role gate, sender-only edit, mutual delete in direct chats or sender/admin delete in groups/channels.
- `chats/{chatId}/reactions` & `poll_votes`: user-scoped doc IDs `{messageId}_{uid}`, `uid == request.auth.uid`, blocked in direct chats when blocked.
- `user_chats/{userId}/items`: strictly scoped by `userId` and `createdBy`, with mutual delete permitted only for members of a `direct` chat.
- `sticker_packs` & `stickers`: strictly scoped to `ownerId == request.auth.uid` for read, list, create, update, and delete.
