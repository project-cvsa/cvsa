import type {
	CreateInvitationRequestDto,
	CreateInvitationResponseDto,
	ListInvitationsResponseDto,
} from "@cvsa/contracts";
import type { ApiResult } from "./result";
import { getEdenClient, settle } from "./treaty";

async function listInvitations(): Promise<ApiResult<ListInvitationsResponseDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.invitations.get());
}

async function createInvitation(
	body: CreateInvitationRequestDto
): Promise<ApiResult<CreateInvitationResponseDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.invitations.post(body));
}

async function revokeInvitation(id: number): Promise<ApiResult<{ message: string } | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.invitations({ id }).delete());
}

export const invitationApi = {
	list: listInvitations,
	create: createInvitation,
	revoke: revokeInvitation,
};
