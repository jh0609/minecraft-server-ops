import * as http from "http";
import * as https from "https";

const GCP_PROJECT = "mcops-495701";
const GCP_ZONE = "asia-northeast3-a";
const GCP_INSTANCE = "mcops-server";
const MAX_OUTPUT_LENGTH = 1200;

type MetadataTokenResponse = {
  access_token: string;
};

type ComputeOperationResponse = {
  id?: string | number;
  name?: string;
  operationType?: string;
  status?: string;
  targetLink?: string;
};

type ComputeInstanceResponse = {
  status?: string;
};

type HttpJsonResponse<T> = {
  body: T;
  statusCode: number;
};

const truncate = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_OUTPUT_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_OUTPUT_LENGTH)}...`;
};

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

const readResponseBody = (
  response: http.IncomingMessage
): Promise<string> =>
  new Promise((resolve, reject) => {
    let data = "";

    response.setEncoding("utf8");
    response.on("data", (chunk: string) => {
      data += chunk;
    });
    response.on("end", () => resolve(data));
    response.on("error", reject);
  });

export const getMetadataToken = async (): Promise<string> => {
  const response = await new Promise<HttpJsonResponse<MetadataTokenResponse>>(
    (resolve, reject) => {
      const request = http.request(
        {
          host: "metadata.google.internal",
          path: "/computeMetadata/v1/instance/service-accounts/default/token",
          method: "GET",
          headers: {
            "Metadata-Flavor": "Google",
          },
        },
        async (result) => {
          try {
            const rawBody = await readResponseBody(result);
            const statusCode = result.statusCode ?? 500;

            if (statusCode < 200 || statusCode >= 300) {
              reject(
                new Error(
                  `Metadata token request failed with status ${statusCode}: ${truncate(rawBody)}`
                )
              );
              return;
            }

            resolve({
              body: parseJson<MetadataTokenResponse>(rawBody),
              statusCode,
            });
          } catch (error) {
            reject(error);
          }
        }
      );

      request.on("error", reject);
      request.end();
    }
  );

  return response.body.access_token;
};

const computeRequest = async <T>(
  accessToken: string,
  method: "GET" | "POST",
  path: string
): Promise<HttpJsonResponse<T>> =>
  new Promise<HttpJsonResponse<T>>((resolve, reject) => {
    const request = https.request(
      {
        host: "compute.googleapis.com",
        path,
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Length": "0",
        },
      },
      async (response) => {
        try {
          const rawBody = await readResponseBody(response);
          const statusCode = response.statusCode ?? 500;

          if (statusCode < 200 || statusCode >= 300) {
            reject(
              new Error(
                `Compute Engine ${method} request failed with status ${statusCode}: ${truncate(rawBody)}`
              )
            );
            return;
          }

          resolve({
            body: rawBody ? parseJson<T>(rawBody) : ({} as T),
            statusCode,
          });
        } catch (error) {
          reject(error);
        }
      }
    );

    request.on("error", reject);
    request.end();
  });

const instancePath = (): string =>
  `/compute/v1/projects/${GCP_PROJECT}/zones/${GCP_ZONE}/instances/${GCP_INSTANCE}`;

export const startInstance = async (
  accessToken: string
): Promise<HttpJsonResponse<ComputeOperationResponse>> =>
  computeRequest<ComputeOperationResponse>(
    accessToken,
    "POST",
    `${instancePath()}/start`
  );

export const getInstance = async (
  accessToken: string
): Promise<HttpJsonResponse<ComputeInstanceResponse>> =>
  computeRequest<ComputeInstanceResponse>(accessToken, "GET", instancePath());

export const getInstanceStatus = async (): Promise<string> => {
  const accessToken = await getMetadataToken();
  const response = await getInstance(accessToken);
  return response.body.status ?? "UNKNOWN";
};

export const getVmConfig = (): {
  project: string;
  zone: string;
  instance: string;
} => ({
  project: GCP_PROJECT,
  zone: GCP_ZONE,
  instance: GCP_INSTANCE,
});

