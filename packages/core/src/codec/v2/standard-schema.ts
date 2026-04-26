/**
 * Minimal inline copy of the Standard Schema v1 contract.
 *
 * Source: https://github.com/standard-schema/standard-schema (MIT, Colin McDonnell et al.).
 * We inline rather than depend on `@standard-schema/spec` because (a) the surface is tiny,
 * (b) it lets us stay zero-runtime-dep at L1, and (c) any vendor (zod, valibot, arktype, ...)
 * that exposes `~standard` is structurally compatible with this type without coordination.
 *
 * Brief H, finding F1: typing `Codec.input` as `StandardSchemaV1<unknown, Req>` instead of
 * `ZodType<Req>` lets userland codecs ship with any conformant validator. See
 * `docs/research/briefs/H_codec_engineering_prior_art.md`.
 *
 * @experimental — part of the v2 codec protocol surface; M0 lands types only, no runtime.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace StandardSchemaV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
    readonly types?: Types<Input, Output> | undefined;
  }

  export type Result<Output> = SuccessResult<Output> | FailureResult;

  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }

  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }

  export interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }

  export interface PathSegment {
    readonly key: PropertyKey;
  }

  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }

  export type InferInput<S extends StandardSchemaV1> = NonNullable<
    S["~standard"]["types"]
  >["input"];

  export type InferOutput<S extends StandardSchemaV1> = NonNullable<
    S["~standard"]["types"]
  >["output"];
}
