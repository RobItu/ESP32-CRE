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
      signature: string
      deviceAddress: string
      filename: string
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
  const { hash, signature, deviceAddress, filename, timestamp } = params.input

  runtime.log(`[Workflow 1] Received capture from device: ${deviceAddress}`)
  runtime.log(`[Workflow 1] Hash: ${hash}`)
  runtime.log(`[Workflow 1] Filename: ${filename}`)

  // Encode for PendingCaptures._processReport
  // (bytes32 imageHash, bytes signature, address deviceAddress, string filename, uint256 capturedAt)
  const imageHashBytes32 = hexToBytes32(hash)
  const capturedAtUnix = BigInt(Math.floor(new Date(timestamp).getTime() / 1000))

  const reportData = encodeAbiParameters(
    parseAbiParameters("bytes32 imageHash, bytes signature, address deviceAddress, string filename, uint256 capturedAt"),
    [
      imageHashBytes32,
      signature as `0x${string}`,
      deviceAddress as `0x${string}`,
      filename,
      capturedAtUnix,
    ]
  )

  runtime.log(`[Workflow 1] Encoded ABI data: ${reportData}`)

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
    receiver: runtime.config.consumerAddress, // PendingCaptures address
    report: reportResponse,
    gasConfig: {
      gasLimit: runtime.config.gasLimit,
    },
  }).result()

  const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32))
  runtime.log(`[Workflow 1] Pending tx: ${txHash}`)
  runtime.log(`[Workflow 1] Etherscan: https://sepolia.etherscan.io/tx/${txHash}`)

  // Notify Proxmox that pending capture was submitted on-chain
  const httpClient = new HTTPClient()

  const postBody = toBase64(JSON.stringify({
    hash,
    txHash,
    filename,
    deviceAddress,
    timestamp,
    status: "pending",
  }))

  const postResp = httpClient.sendRequest(
    runtime,
    (sendRequester, _config) => {
      const resp = sendRequester.sendRequest({
        url: `${runtime.config.proxmoxApiUrl}/cre-pending`,
        method: "POST" as const,
        headers: { "Content-Type": "application/json" },
        body: postBody,
      }).result()
      return { statusCode: resp.statusCode }
    },
    consensusIdenticalAggregation<{ statusCode: number }>()
  )(runtime.config).result()

  runtime.log(`[Workflow 1] Notified Proxmox, status: ${postResp.statusCode}`)

  return JSON.stringify({
    success: true,
    status: "pending",
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