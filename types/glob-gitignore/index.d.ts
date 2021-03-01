declare module 'glob-gitignore' {
  export function glob(pattern: string): Promise<string[]>
  export function hasMagic(pattern: string): boolean
}
