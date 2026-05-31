#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const allowMissing = args.includes("--allow-missing");
const dirArg = args.find((arg) => !arg.startsWith("--"));
const dir = resolve(dirArg ?? "artifacts/m1b-audit");

const requiredFiles = [
  {
    name: "gate-c-roundtrip.json",
    aliases: ["gate-c-pass.fixture.json"],
    validate: validateGateC,
  },
  {
    name: "gate-d-onnx-export.json",
    aliases: ["gate-d-onnx-export.fixture.json"],
    validate: validateGateDExport,
  },
  {
    name: "gate-d-onnx-cpu.json",
    aliases: ["gate-d-fail.fixture.json"],
    validate: validateGateD,
  },
  {
    name: "vqgan-gates.json",
    aliases: ["vqgan-gates-blocked.fixture.json"],
    validate: validateFinalReceipt,
  },
];

const issues = [];

for (const file of requiredFiles) {
  const parsed = readFirstJson(dir, file);
  if (!parsed.ok) {
    if (!allowMissing || parsed.reason !== "missing") {
      issues.push(`${file.name}: ${parsed.message}`);
    }
    continue;
  }
  for (const issue of file.validate(parsed.value)) {
    issues.push(`${file.name}: ${issue}`);
  }
}

if (issues.length > 0) {
  console.error(JSON.stringify({ ok: false, dir, issues }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify({ ok: true, dir, checked: requiredFiles.map((file) => file.name) }, null, 2),
  );
}

function readJson(path) {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { ok: false, reason: "missing", message: "file is missing" };
    }
    return { ok: false, reason: "invalid-json", message: error.message };
  }
}

function readFirstJson(dir, file) {
  const candidates = [file.name, ...(file.aliases ?? [])];
  const missing = [];
  for (const candidate of candidates) {
    const parsed = readJson(join(dir, candidate));
    if (parsed.ok) {
      return parsed;
    }
    if (parsed.reason !== "missing") {
      return parsed;
    }
    missing.push(candidate);
  }
  return {
    ok: false,
    reason: "missing",
    message: `file is missing; tried ${missing.join(", ")}`,
  };
}

function validateGateC(value) {
  const issues = [];
  requireEqual(value, "schema_version", "m1b-gate-c-roundtrip-metrics.v0", issues);
  requireBoolean(value, "roundtrip_passed", issues);
  requireBoolean(value, "encode_consistent", issues);
  requireBoolean(value, "decode_consistent", issues);
  requireNumber(value, "sample_count", issues);
  requireNumber(value, "token_hamming_rate", issues);
  requireOptionalStringEnum(
    value,
    "cross_device_parity",
    ["byte-identical", "token-identical", "structural-only"],
    issues,
  );
  requireArray(value, "token_sha256s", issues);
  requireArray(value, "decoded_sha256s", issues);
  requireObject(value, "environment", issues);
  if (
    value.encode_consistent === true &&
    value.decode_consistent === true &&
    value.sample_count < 3
  ) {
    issues.push("passed Gate C metrics require sample_count>=3");
  }
  if (value.roundtrip_passed === false && typeof value.reencode_token_hamming_rate !== "number") {
    issues.push("non-fixed-point Gate C metrics must report reencode_token_hamming_rate");
  }
  return issues;
}

function validateGateDExport(value) {
  const issues = [];
  requireEqual(value, "schema_version", "m1b-gate-d-onnx-export.v0", issues);
  requireStringEnum(value, "status", ["passed", "blocked"], issues);
  requireObject(value, "environment", issues);
  requireObject(value, "inputs", issues);
  if (value.status === "passed") {
    requireSha(value, "onnx_sha256", issues);
    requireString(value, "onnx", issues);
  }
  return issues;
}

function validateGateD(value) {
  const issues = [];
  requireEqual(value, "schema_version", "m1b-gate-d-onnx-cpu-metrics.v0", issues);
  requireBoolean(value, "onnx_cpu_passed", issues);
  requireNumber(value, "cpu_decode_seconds", issues);
  requireArray(value, "output_shape", issues);
  requireSha(value, "output_sha256", issues);
  requireObject(value, "environment", issues);
  requireObject(value, "inputs", issues);
  if (!value.inputs || typeof value.inputs.onnx_sha256 !== "string") {
    issues.push("inputs.onnx_sha256 must be present");
  }
  if (value.onnx_cpu_passed === true && value.cpu_decode_seconds > 30.0) {
    issues.push("passed Gate D metrics require cpu_decode_seconds<=30");
  }
  if (
    value.onnx_cpu_passed === true &&
    JSON.stringify(value.output_shape) !== JSON.stringify([256, 256, 3])
  ) {
    issues.push("passed Gate D metrics require output_shape=[256,256,3]");
  }
  return issues;
}

function validateFinalReceipt(value) {
  const issues = [];
  requireEqual(value, "schema_version", "m1b-vqgan-gate-audit.v0", issues);
  requireString(value, "candidate", issues);
  requireStringEnum(value, "status", ["passed", "blocked", "skipped"], issues);
  requireArray(value, "gates", issues);
  if (Array.isArray(value.gates)) {
    for (const gate of ["C", "D"]) {
      if (!value.gates.some((entry) => entry && entry.gate === gate)) {
        issues.push(`gates must contain Gate ${gate}`);
      }
    }
    const gateC = value.gates.find((entry) => entry && entry.gate === "C");
    if (gateC?.status === "passed") {
      requireObject(gateC, "metrics", issues);
      requireBoolean(gateC.metrics, "encode_consistent", issues);
      requireBoolean(gateC.metrics, "decode_consistent", issues);
      requireNumber(gateC.metrics, "sample_count", issues);
      requireStringEnum(
        gateC.metrics,
        "cross_device_parity",
        ["byte-identical", "token-identical", "structural-only"],
        issues,
      );
    }
    const gateD = value.gates.find((entry) => entry && entry.gate === "D");
    if (gateD?.status === "passed") {
      requireObject(gateD, "metrics", issues);
      requireBoolean(gateD.metrics, "onnx_cpu_passed", issues);
      requireNumber(gateD.metrics, "cpu_decode_seconds", issues);
      requireArray(gateD.metrics, "output_shape", issues);
    }
  }
  return issues;
}

function requireEqual(value, key, expected, issues) {
  if (value?.[key] !== expected) {
    issues.push(`${key} must be ${expected}`);
  }
}

function requireBoolean(value, key, issues) {
  if (typeof value?.[key] !== "boolean") {
    issues.push(`${key} must be boolean`);
  }
}

function requireNumber(value, key, issues) {
  if (typeof value?.[key] !== "number") {
    issues.push(`${key} must be number`);
  }
}

function requireString(value, key, issues) {
  if (typeof value?.[key] !== "string" || value[key].length === 0) {
    issues.push(`${key} must be non-empty string`);
  }
}

function requireStringEnum(value, key, allowed, issues) {
  if (!allowed.includes(value?.[key])) {
    issues.push(`${key} must be one of ${allowed.join(", ")}`);
  }
}

function requireOptionalStringEnum(value, key, allowed, issues) {
  if (value?.[key] !== undefined) {
    requireStringEnum(value, key, allowed, issues);
  }
}

function requireArray(value, key, issues) {
  if (!Array.isArray(value?.[key])) {
    issues.push(`${key} must be array`);
  }
}

function requireObject(value, key, issues) {
  if (!value?.[key] || typeof value[key] !== "object" || Array.isArray(value[key])) {
    issues.push(`${key} must be object`);
  }
}

function requireSha(value, key, issues) {
  if (typeof value?.[key] !== "string" || !/^[a-f0-9]{64}$/.test(value[key])) {
    issues.push(`${key} must be 64-char lowercase sha256`);
  }
}
