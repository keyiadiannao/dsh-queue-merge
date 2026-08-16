/**
 * CSS Module type declaration for the standalone plugin typecheck.
 * The real bundler (tsdown dsh-css-modules-inline) compiles `.module.css` and
 * injects the hashed class map; tsc only needs the shape here.
 */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
