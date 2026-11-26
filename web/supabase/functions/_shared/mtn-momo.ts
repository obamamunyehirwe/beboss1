export type MtnMomoEnvironment = "sandbox" | "production";

export class MtnMomoRequestRejectedError extends Error {
  readonly httpStatus: number;
  constructor(httpStatus: number, detail: string) {
    super("MTN MoMo rejected the Request-to-Pay request (HTTP " + httpStatus + ")" + (detail ? ": " + detail : "") + ".");
    this.name = "MtnMomoRequestRejectedError";
    this.httpStatus = httpStatus;
  }
}


export type MtnMomoConfiguration = {
  environment: MtnMomoEnvironment;
  baseUrl: string;
  targetEnvironment: string;
  collectionsSubscriptionKey: string;
  apiUser: string;
  apiKey: string;
  credentialKind: "sandbox_api_user_key" | "production_user_id_token";
};

export type MtnMomoStatus = {
  amount: string;
  currency: string;
  externalId: string;
  financialTransactionId?: string;
  status: "PENDING" | "SUCCESSFUL" | "FAILED";
  payer?: { partyIdType?: string; partyId?: string };
  reason?: { code?: string; message?: string };
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error(`MTN MoMo is not configured: set ${name} in Supabase Edge Function secrets.`);
  return value;
}

export function readMtnMomoConfiguration(): MtnMomoConfiguration {
  const environment = (Deno.env.get("MTN_MOMO_ENV") ?? "sandbox").trim().toLowerCase();
  if (environment !== "sandbox" && environment !== "production") {
    throw new Error("MTN_MOMO_ENV must be sandbox or production.");
  }

  // Rwanda is marked live on the new MoMo API platform. The current partner
  // migration notice changes production to momoapi.momo.africa and new system
  // credentials; sandbox continues to use the legacy sandbox API User + API Key.
  const defaultBaseUrl = environment === "sandbox"
    ? "https://sandbox.momodeveloper.mtn.com"
    : "https://momoapi.momo.africa";
  const baseUrl = (Deno.env.get("MTN_MOMO_BASE_URL")?.trim() || defaultBaseUrl).replace(/\/+$/, "");
  const parsed = new URL(baseUrl);
  const expectedHost = environment === "sandbox"
    ? "sandbox.momodeveloper.mtn.com"
    : "momoapi.momo.africa";
  if (parsed.protocol !== "https:" || parsed.hostname !== expectedHost ||
      parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`MTN_MOMO_BASE_URL must be https://${expectedHost} for the selected environment.`);
  }

  const targetEnvironment = (Deno.env.get("MTN_MOMO_TARGET_ENVIRONMENT")?.trim() ||
    (environment === "sandbox" ? "sandbox" : "mtnrwanda")).toLowerCase();
  if (targetEnvironment !== (environment === "sandbox" ? "sandbox" : "mtnrwanda")) {
    throw new Error(environment === "sandbox"
      ? "MTN_MOMO_TARGET_ENVIRONMENT must be sandbox for the sandbox API."
      : "MTN_MOMO_TARGET_ENVIRONMENT must be mtnrwanda for the MTN Rwanda production API.");
  }

  const credentials = environment === "sandbox"
    ? {
      apiUser: requiredEnv("MTN_MOMO_API_USER"),
      apiKey: requiredEnv("MTN_MOMO_API_KEY"),
      credentialKind: "sandbox_api_user_key" as const,
    }
    : {
      apiUser: requiredEnv("MTN_MOMO_USER_ID"),
      apiKey: requiredEnv("MTN_MOMO_CREDENTIAL_TOKEN"),
      credentialKind: "production_user_id_token" as const,
    };

  return {
    environment,
    baseUrl,
    targetEnvironment,
    collectionsSubscriptionKey: requiredEnv("MTN_MOMO_COLLECTIONS_SUBSCRIPTION_KEY"),
    ...credentials,
  };
}

function basicAuthorization(user: string, key: string): string {
  return "Basic " + btoa(`${user}:${key}`);
}

export async function getMtnMomoAccessToken(
  config: MtnMomoConfiguration,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher(`${config.baseUrl}/collection/token/`, {
    method: "POST",
    headers: {
      Authorization: basicAuthorization(config.apiUser, config.apiKey),
      "Ocp-Apim-Subscription-Key": config.collectionsSubscriptionKey,
      "X-Target-Environment": config.targetEnvironment,
      Accept: "application/json",
    },
  });
  const body = await response.json().catch(() => ({}));
  const token = String(body?.access_token ?? "");
  if (!response.ok || !token) {
    throw new Error(`MTN MoMo access-token request failed (HTTP ${response.status}). Check the Collections subscription key and the credential pair for the selected environment.`);
  }
  return token;
}

export async function requestMtnMomoPayment(
  config: MtnMomoConfiguration,
  input: {
    referenceId: string;
    externalId: string;
    amountRwf: number;
    payerMsisdn: string;
    payerMessage: string;
  },
  fetcher: typeof fetch = fetch,
  existingAccessToken?: string,
): Promise<{ accepted: boolean; referenceId: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(input.referenceId)) throw new Error("MTN MoMo reference ID must be a UUID.");
  if (!Number.isSafeInteger(input.amountRwf) || input.amountRwf < 1) throw new Error("MTN MoMo amount must be a positive whole-RWF value.");
  if (!/^2507\d{8}$/.test(input.payerMsisdn)) throw new Error("MTN MoMo payer must be a Rwanda mobile MSISDN.");
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(input.externalId)) throw new Error("MTN MoMo external ID is invalid.");

  const accessToken = existingAccessToken || await getMtnMomoAccessToken(config, fetcher);
  const headers = new Headers({
    Authorization: `Bearer ${accessToken}`,
    "Ocp-Apim-Subscription-Key": config.collectionsSubscriptionKey,
    "X-Target-Environment": config.targetEnvironment,
    "X-Reference-Id": input.referenceId,
    "Content-Type": "application/json",
    Accept: "application/json",
  });
  const response = await fetcher(`${config.baseUrl}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      amount: String(input.amountRwf),
      currency: "RWF",
      externalId: input.externalId,
      payer: { partyIdType: "MSISDN", partyId: input.payerMsisdn },
      payerMessage: input.payerMessage.slice(0, 160),
      payeeNote: "BeBoss subscription",
    }),
  });
  if (response.status !== 202) {
    const detail = (await response.text().catch(() => "")).slice(0, 240);
    throw new MtnMomoRequestRejectedError(response.status, detail);
  }
  return { accepted: true, referenceId: input.referenceId };
}

export async function getMtnMomoPaymentStatus(
  config: MtnMomoConfiguration,
  referenceId: string,
  fetcher: typeof fetch = fetch,
): Promise<MtnMomoStatus> {
  if (!/^[0-9a-f-]{36}$/i.test(referenceId)) throw new Error("MTN MoMo status reference is invalid.");
  const accessToken = await getMtnMomoAccessToken(config, fetcher);
  const response = await fetcher(
    `${config.baseUrl}/collection/v1_0/requesttopay/${encodeURIComponent(referenceId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Ocp-Apim-Subscription-Key": config.collectionsSubscriptionKey,
        "X-Target-Environment": config.targetEnvironment,
        Accept: "application/json",
      },
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`MTN MoMo status query failed (HTTP ${response.status}).`);
  const state = String(body?.status ?? "").toUpperCase();
  if (!["PENDING", "SUCCESSFUL", "FAILED"].includes(state)) {
    throw new Error("MTN MoMo returned an unrecognized payment state; settlement remains pending review.");
  }
  return {
    amount: String(body?.amount ?? ""),
    currency: String(body?.currency ?? ""),
    externalId: String(body?.externalId ?? ""),
    financialTransactionId: String(body?.financialTransactionId ?? ""),
    status: state as MtnMomoStatus["status"],
    payer: body?.payer && typeof body.payer === "object" ? {
      partyIdType: String(body.payer.partyIdType ?? ""),
      partyId: String(body.payer.partyId ?? ""),
    } : undefined,
    reason: body?.reason && typeof body.reason === "object" ? {
      code: String(body.reason.code ?? ""),
      message: String(body.reason.message ?? ""),
    } : undefined,
  };
}

export function matchesMtnMomoSettlement(
  status: MtnMomoStatus,
  expected: { externalId: string; amountRwf: number; payerMsisdn: string },
): boolean {
  const payerId = status.payer?.partyId ?? "";
  const payerType = status.payer?.partyIdType ?? "";
  return status.status === "SUCCESSFUL" &&
    status.currency.toUpperCase() === "RWF" &&
    Number(status.amount) === expected.amountRwf &&
    status.externalId === expected.externalId &&
    Boolean(status.financialTransactionId) &&
    payerType === "MSISDN" &&
    payerId.length > 0 &&
    payerId.replace(/\D/g, "").slice(-9) === expected.payerMsisdn.slice(-9);
}
