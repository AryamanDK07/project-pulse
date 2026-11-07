/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native/driver packages must stay out of the webpack bundle on the server.
  serverExternalPackages: ['pg', 'mongoose'],
};
export default nextConfig;
