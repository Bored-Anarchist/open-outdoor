export const normalize = (record) => ({
  name: record.name.trim(),
  classification: 'PRIVATE_USER',
  synthetic: true,
});
