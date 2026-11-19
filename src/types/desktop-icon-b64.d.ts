// Build-time import for the creator-supplied desktop logo.
declare module '*.webp.b64' {
  const sourceBase64: string
  export default sourceBase64
}
