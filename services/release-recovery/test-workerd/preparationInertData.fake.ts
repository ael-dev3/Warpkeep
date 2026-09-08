/** Test-only import sentinel. It cannot pass the production fixture parser.
 * Used solely to load the actual signer entrypoint for its no-policy refusal.
 * This does not constitute a production signer bundle or fixture validation. */
export default new ArrayBuffer(0)
