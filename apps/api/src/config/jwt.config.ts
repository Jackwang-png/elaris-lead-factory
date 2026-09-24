export default () => ({
  jwt: {
    secret: process.env.JWT_SECRET || 'smartcs-secret',
    expiresIn: '7d',
  },
});
