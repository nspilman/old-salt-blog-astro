import { createClient } from "tinacms/dist/client";
import { queries } from "./types";
export const client = createClient({ url: 'http://localhost:4001/graphql', token: '4bd7db4c24554a97208577e43e744ee6a04796f1', queries,  });
export default client;
  