import type { CreatePolishRequest, PolishResponse } from "@career/contracts/types";

import { requestJson } from "./http";

export async function polishSectionContent(payload: CreatePolishRequest): Promise<PolishResponse> {
  return requestJson<PolishResponse>("/api/v2/polish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
