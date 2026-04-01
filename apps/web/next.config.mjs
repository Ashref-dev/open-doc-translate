/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@workspace/ui"],
  serverExternalPackages: ["pdfjs-dist"],
}

export default nextConfig
