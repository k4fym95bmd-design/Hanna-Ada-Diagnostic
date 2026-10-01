export interface TestOutcomeModel<H extends string> {
  readonly testId: string;
  readonly outcomes: readonly string[];
  /** P(outcome | H,T), indexed by hypothesis then outcome. */
  readonly conditional: Readonly<Record<H, Readonly<Record<string, number>>>>;
  readonly cost: number;
  readonly time: number;
  readonly invasiveness: number;
}

export interface UtilityWeights {
  readonly informationGain: number;
  readonly cost: number;
  readonly time: number;
  readonly invasiveness: number;
}

export interface RankedTest {
  readonly testId: string;
  readonly expectedInformationGain: number;
  readonly utility: number;
}

export type NextBestTestResult =
  | { readonly status: "READY"; readonly test: RankedTest }
  | { readonly status: "INSUFFICIENT_MODEL_EVIDENCE"; readonly reason: string };

function entropy<H extends string>(p: Readonly<Record<H, number>>): number {
  return Object.values(p as Readonly<Record<string, number>>).reduce(
    (sum, value) => value > 0 ? sum - value * Math.log(value) : sum, 0,
  );
}

function validateDistribution(values: readonly number[]): boolean {
  if (values.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) return false;
  return Math.abs(values.reduce((a,b)=>a+b,0) - 1) <= 1e-9;
}

export function evaluateTest<H extends string>(
  posterior: Readonly<Record<H, number>>,
  model: TestOutcomeModel<H>,
  weights: UtilityWeights,
): RankedTest | null {
  const hypotheses = Object.keys(posterior) as H[];
  if (!validateDistribution(hypotheses.map((h) => posterior[h]))) return null;
  if (model.outcomes.length === 0) return null;

  for (const h of hypotheses) {
    const row = model.conditional[h];
    if (!row || !validateDistribution(model.outcomes.map((o) => row[o]))) return null;
  }

  const currentEntropy = entropy(posterior);
  let expectedPosteriorEntropy = 0;

  for (const outcome of model.outcomes) {
    const pOutcome = hypotheses.reduce((sum,h) => sum + posterior[h] * model.conditional[h][outcome], 0);
    if (pOutcome <= 0) continue;
    const conditioned = Object.fromEntries(
      hypotheses.map((h) => [h, posterior[h] * model.conditional[h][outcome] / pOutcome]),
    ) as Record<H, number>;
    expectedPosteriorEntropy += pOutcome * entropy(conditioned);
  }

  const ig = Math.max(0, currentEntropy - expectedPosteriorEntropy);
  const utility =
    weights.informationGain * ig -
    weights.cost * model.cost -
    weights.time * model.time -
    weights.invasiveness * model.invasiveness;

  return Object.freeze({ testId: model.testId, expectedInformationGain: ig, utility });
}

export function nextBestTest<H extends string>(
  posterior: Readonly<Record<H, number>>,
  models: readonly TestOutcomeModel<H>[],
  weights: UtilityWeights,
): NextBestTestResult {
  const ranked = models.map((m) => evaluateTest(posterior, m, weights)).filter((x): x is RankedTest => x !== null);
  if (ranked.length === 0) {
    return { status: "INSUFFICIENT_MODEL_EVIDENCE", reason: "No complete verified P(outcome|H,T) matrix is available." };
  }
  ranked.sort((a,b) => b.utility - a.utility || a.testId.localeCompare(b.testId));
  return { status: "READY", test: ranked[0] };
}
