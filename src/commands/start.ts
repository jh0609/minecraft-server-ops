import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import * as http from "http";
import * as https from "https";

const data = new SlashCommandBuilder()
  .setName("start")
  .setDescription("Start the Minecraft VM");

const MAX_OUTPUT_LENGTH = 1200;
const GCP_PROJECT = "mcops-495701";
const GCP_ZONE = "asia-northeast3-a";
const GCP_INSTANCE = "mcops-server";

const truncate = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_OUTPUT_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_OUTPUT_LENGTH)}...`;
};

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

type HttpJsonResponse<T> = {
  body: T;
  statusCode: number;
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

const getMetadataToken = async (): Promise<string> => {
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

const startInstance = async (
  accessToken: string
): Promise<HttpJsonResponse<ComputeOperationResponse>> => {
  const path = `/compute/v1/projects/${GCP_PROJECT}/zones/${GCP_ZONE}/instances/${GCP_INSTANCE}/start`;

  return new Promise<HttpJsonResponse<ComputeOperationResponse>>(
    (resolve, reject) => {
      const request = https.request(
        {
          host: "compute.googleapis.com",
          path,
          method: "POST",
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
                  `Compute Engine start request failed with status ${statusCode}: ${truncate(rawBody)}`
                )
              );
              return;
            }

            resolve({
              body: rawBody
                ? parseJson<ComputeOperationResponse>(rawBody)
                : {},
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
};

const execute = async (interaction: CommandInteraction): Promise<void> => {
  await interaction.deferReply();

  try {
    const accessToken = await getMetadataToken();
    const response = await startInstance(accessToken);
    const operation = response.body;

    await interaction.followUp(
      [
        "Minecraft VM start requested successfully.",
        `instance: ${GCP_INSTANCE}`,
        `zone: ${GCP_ZONE}`,
        `operationStatus: ${operation.status ?? "unknown"}`,
        operation.name ? `operationName: ${operation.name}` : undefined,
      ]
        .filter(Boolean)
        .join("\n")
    );
  } catch (error) {
    await interaction.followUp({
      content: `Minecraft VM start failed.\n${error}`,
      ephemeral: true,
    });
  }
};

export { data, execute };
