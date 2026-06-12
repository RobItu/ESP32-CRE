import {
  HTTPCapability,
  HTTPClient,
  EVMClient,
  handler,
  consensusIdenticalAggregation,
  decodeJson,
  type Runtime,
  type HTTPPayload,
  Runner,
  getNetwork,
  hexToBase64,
  bytesToHex,
} from "@chainlink/cre-sdk"
import { encodeAbiParameters, parseAbiParameters } from "viem"
import { z } from "zod"

const configSchema = z.object({
  chainSelectorName: z.string(),
  consumerAddress: z.string(),
  gasLimit: z.string(),
  proxmoxApiUrl: z.string(),
})
type Config = z.infer<typeof configSchema>

type IncomingPayload = {
  params: {
    input: {
      hash: string
      filename: string
      deviceAddress: string
      timestamp: string
    }
  }
}

const toBase64 = (s: string): string => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(s).toString("base64")
  }
  return btoa(unescape(encodeURIComponent(s)))
}

const hexToBytes32 = (hex: string): `0x${string}` => {
  const cleaned = hex.startsWith("0x") ? hex : `0x${hex}`
  return cleaned.padEnd(66, "0") as `0x${string}`
}

const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
  const { params } = decodeJson(payload.input) as IncomingPayload
  const { hash, filename, deviceAddress, timestamp } = params.input

  runtime.log(`[Workflow 2] Confirming capture: ${hash}`)
  runtime.log(`[Workflow 2] Device: ${deviceAddress}`)

  // Encode only the imageHash for CredibleRegistry._processReport
  // Registry pulls all other data from PendingCaptures on-chain
  const imageHashBytes32 = hexToBytes32(hash)

  const reportData = encodeAbiParameters(
    parseAbiParameters("bytes32 imageHash"),
    [imageHashBytes32]
  )

  runtime.log(`[Workflow 2] Encoded ABI data: ${reportData}`)

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  })

  if (!network) {
    throw new Error(`Unknown chain: ${runtime.config.chainSelectorName}`)
  }

  const evmClient = new EVMClient(network.chainSelector.selector)

  const reportResponse = runtime.report({
    encodedPayload: hexToBase64(reportData),
    encoderName: "evm",
    signingAlgo: "ecdsa",
    hashingAlgo: "keccak256",
  }).result()

  const writeResult = evmClient.writeReport(runtime, {
    receiver: runtime.config.consumerAddress, // CredibleRegistry address
    report: reportResponse,
    gasConfig: {
      gasLimit: runtime.config.gasLimit,
    },
  }).result()

  const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32))
  runtime.log(`[Workflow 2] Confirmed tx: ${txHash}`)
  runtime.log(`[Workflow 2] Etherscan: https://sepolia.etherscan.io/tx/${txHash}`)

  // POST final tx hash back to Proxmox to update PostgreSQL
  const httpClient = new HTTPClient()

  const postBody = toBase64(JSON.stringify({
    hash,
    txHash,
    filename,
    deviceAddress,
    timestamp,
    status: "confirmed",
  }))

  const postResp = httpClient.sendRequest(
    runtime,
    (sendRequester, _config) => {
      const resp = sendRequester.sendRequest({
        url: `${runtime.config.proxmoxApiUrl}/cre-callback`,
        method: "POST" as const,
        headers: { "Content-Type": "application/json" },
        body: postBody,
      }).result()
      return { statusCode: resp.statusCode }
    },
    consensusIdenticalAggregation<{ statusCode: number }>()
  )(runtime.config).result()

  runtime.log(`[Workflow 2] Notified Proxmox, status: ${postResp.statusCode}`)

  return JSON.stringify({
    success: true,
    status: "confirmed",
    txHash,
    etherscan: `https://sepolia.etherscan.io/tx/${txHash}`,
  })
}

const initWorkflow = (config: Config) => {
  return [
    handler(
      new HTTPCapability().trigger({}),
      onHttpTrigger
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema })
  await runner.run(initWorkflow)
}