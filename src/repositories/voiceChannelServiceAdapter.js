import {
  createVoiceChannel as repoCreate,
  deleteVoiceChannel as repoDelete,
  updateVoiceChannelOwner as repoSetOwner,
  updateVoiceChannelLock as repoSetLock,
  updateVoiceChannelLimit as repoSetLimit,
  updateVoiceChannelName as repoSetName,
  grantVoiceChannelPermission as repoGrantPerm,
  revokeVoiceChannelPermission as repoRevokePerm,
  getVoiceChannel as repoGetVoiceChannel,
} from './voiceRepo.js';

export const voiceRepoAdapter = {
  recordCreate: (channelId, guildId, ownerId, name) => repoCreate(channelId, guildId, ownerId, name),
  recordDelete: (channelId) => repoDelete(channelId),
  setOwner: (channelId, ownerId) => repoSetOwner(channelId, ownerId),
  setLock: (channelId, isLocked) => repoSetLock(channelId, isLocked),
  setLimit: (channelId, limit) => repoSetLimit(channelId, limit),
  setName: (channelId, name) => repoSetName(channelId, name),
  grantPerm: (channelId, userId, type) => repoGrantPerm(channelId, userId, type),
  revokePerm: (channelId, userId, type) => repoRevokePerm(channelId, userId, type)
};

export const voiceOwnership = {
  getOwnerId: async (channelId) => {
    try {
      const row = await repoGetVoiceChannel(channelId);
      return row?.owner_id;
    } catch {
      return undefined;
    }
  }
};


