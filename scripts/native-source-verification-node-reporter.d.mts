export const NODE_EVENT_SCHEMA: 'warpkeep-node-test-events-v1';
export const MAX_EVENT_BYTES: number;
export default function reportNodeEvents(source: AsyncIterable<unknown>): AsyncGenerator<string>;
