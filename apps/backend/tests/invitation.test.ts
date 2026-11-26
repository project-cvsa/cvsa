import { describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "@/index";
import { db, user as userTable } from "@cvsa/db";
import { createSession, ensureEditorRole, ensureOwnerRole } from "@cvsa/authentication";

const api = treaty(app);
const rand = () => Math.random().toString(36).slice(2, 8);

async function setupOwnerUser() {
	const ownerRole = await ensureOwnerRole();
	const [owner] = await db
		.insert(userTable)
		.values({
			id: `u_owner_${rand()}`,
			username: `owner_${rand()}`,
			displayUsername: `owner_${rand()}`,
			name: "Owner User",
			roleId: ownerRole.id,
			reputation: 0,
			emailVerified: false,
		})
		.returning();

	const session = await createSession(owner.id);
	return { owner, session, token: session.token };
}

async function setupEditorUser() {
	const editorRole = await ensureEditorRole();
	const [editor] = await db
		.insert(userTable)
		.values({
			id: `u_editor_${rand()}`,
			username: `editor_${rand()}`,
			displayUsername: `editor_${rand()}`,
			name: "Editor User",
			roleId: editorRole.id,
			reputation: 0,
			emailVerified: false,
		})
		.returning();

	const session = await createSession(editor.id);
	return { editor, session, token: session.token };
}

describe("Invitation Code & Registration Flow", () => {
	test("editor cannot access invitation admin management (403)", async () => {
		const { token } = await setupEditorUser();

		const { status } = await api.v2.admin.invitations.get({
			headers: { authorization: `Bearer ${token}` },
		});
		expect(status).toBe(403);
	});

	test("owner can create and list invitation codes", async () => {
		const { token } = await setupOwnerUser();

		// 1. Create an invitation code
		const customCode = `TEST-INV-${rand().toUpperCase()}`;
		const createRes = await api.v2.admin.invitations.post(
			{
				code: customCode,
				roleName: "editor",
				maxUses: 2,
				expiresInDays: 7,
			},
			{
				headers: { authorization: `Bearer ${token}` },
			}
		);

		expect(createRes.status).toBe(200);
		expect(createRes.data?.data).toMatchObject({
			code: customCode,
			roleName: "editor",
			maxUses: 2,
			usedCount: 0,
		});

		// 2. List invitation codes
		const listRes = await api.v2.admin.invitations.get({
			headers: { authorization: `Bearer ${token}` },
		});

		expect(listRes.status).toBe(200);
		const found = listRes.data?.data.find((item) => item.code === customCode);
		expect(found).toBeDefined();
		expect(found?.maxUses).toBe(2);
	});

	test("user can register with valid invitation code and receives editor role", async () => {
		const { token: ownerToken } = await setupOwnerUser();

		const code = `TEST-REG-${rand().toUpperCase()}`;
		await api.v2.admin.invitations.post(
			{
				code,
				roleName: "editor",
				maxUses: 1,
			},
			{
				headers: { authorization: `Bearer ${ownerToken}` },
			}
		);

		const username = `invited_user_${rand()}`;
		const signupRes = await api.v2.user.post({
			username,
			password: "password123",
			email: `${username}@example.com`,
			inviteCode: code,
		});

		expect(signupRes.status).toBe(200);
		const userToken = signupRes.data?.data.token;
		expect(userToken).toBeDefined();

		// Verify role on profile /v2/me
		const meRes = await api.v2.me.get({
			headers: { authorization: `Bearer ${userToken}` },
		});
		expect(meRes.status).toBe(200);
		expect(meRes.data?.roleName).toBe("editor");
	});

	test("registration fails with invalid invite code", async () => {
		const signupRes = await api.v2.user.post({
			username: `invalid_invite_user_${rand()}`,
			password: "password123",
			inviteCode: "NONEXISTENT_CODE_XYZ",
		});

		expect(signupRes.status).toBe(400);
		expect(signupRes.error?.value).toMatchObject({
			code: "INVALID_INVITE_CODE",
		});
	});

	test("registration fails when invite code reaches maximum uses", async () => {
		const { token: ownerToken } = await setupOwnerUser();

		const code = `TEST-EXHAUST-${rand().toUpperCase()}`;
		await api.v2.admin.invitations.post(
			{
				code,
				roleName: "editor",
				maxUses: 1,
			},
			{
				headers: { authorization: `Bearer ${ownerToken}` },
			}
		);

		// First user uses the code successfully
		const signup1 = await api.v2.user.post({
			username: `user_exhaust_1_${rand()}`,
			password: "password123",
			inviteCode: code,
		});
		expect(signup1.status).toBe(200);

		// Second user attempts to use the same single-use code
		const signup2 = await api.v2.user.post({
			username: `user_exhaust_2_${rand()}`,
			password: "password123",
			inviteCode: code,
		});
		expect(signup2.status).toBe(400);
		expect(signup2.error?.value).toMatchObject({
			code: "INVITE_CODE_EXHAUSTED",
		});
	});

	test("owner can revoke an invitation code", async () => {
		const { token: ownerToken } = await setupOwnerUser();

		const createRes = await api.v2.admin.invitations.post(
			{
				roleName: "editor",
				maxUses: 1,
			},
			{
				headers: { authorization: `Bearer ${ownerToken}` },
			}
		);
		const codeId = createRes.data?.data.id;
		expect(codeId).toBeDefined();
		if (codeId === undefined) throw new Error("Expected codeId to be defined");

		const deleteRes = await api.v2.admin.invitations({ id: codeId }).delete(null, {
			headers: { authorization: `Bearer ${ownerToken}` },
		});
		expect(deleteRes.status).toBe(200);

		// Subsequent registration with this code fails
		const signup = await api.v2.user.post({
			username: `revoked_code_user_${rand()}`,
			password: "password123",
			inviteCode: createRes.data?.data.code,
		});
		expect(signup.status).toBe(400);
		expect(signup.error?.value).toMatchObject({
			code: "INVALID_INVITE_CODE",
		});
	});
});
