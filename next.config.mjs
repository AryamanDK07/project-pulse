/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native/driver packages must stay out of the webpack bundle on the server.
  serverExternalPackages: ['pg', 'mongoose', '@huggingface/transformers', 'onnxruntime-node'],
};
export default nextConfig;
