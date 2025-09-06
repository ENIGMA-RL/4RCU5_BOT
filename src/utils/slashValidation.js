export function validateSlashCommand(cmd) {
  if (!cmd?.data?.name || typeof cmd.data.name !== 'string') {
    throw new Error('Invalid command: missing data.name');
  }
  if (cmd.data.description && typeof cmd.data.description !== 'string') {
    throw new Error(`Invalid command ${cmd.data.name}: description must be string`);
  }
  if (cmd.data.options && !Array.isArray(cmd.data.options)) {
    throw new Error(`Invalid command ${cmd.data.name}: options must be array`);
  }
  if (typeof cmd.execute !== 'function') {
    throw new Error(`Invalid command ${cmd.data.name}: missing execute()`);
  }
  return true;
}


