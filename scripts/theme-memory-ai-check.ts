import { probeOllama, smokeTestOllamaMembership } from '@/lib/themeMemory/ai/ollama';
import { parseMembershipOutput } from '@/lib/themeMemory/ai/validate';

async function main() {
  const probe = await probeOllama();
  console.log('Ollama probe');
  console.log(`  baseUrl: ${probe.baseUrl}`);
  console.log(`  model: ${probe.model || '(unset)'}`);
  console.log(`  reachable: ${probe.reachable}`);
  console.log(`  ok: ${probe.ok}`);
  if (probe.error) console.log(`  error: ${probe.error}`);
  if (!probe.ok) process.exit(1);

  const smoke = await smokeTestOllamaMembership();
  parseMembershipOutput(JSON.stringify(smoke.decision));
  console.log('Membership schema');
  console.log(`  provider: ${smoke.provider}`);
  console.log(`  model: ${smoke.model}`);
  console.log(`  belongs: ${smoke.decision.belongs}`);
  console.log(`  confidence: ${smoke.decision.confidence}`);
  console.log(`  reasons: ${smoke.decision.reasons.join('; ') || '(none)'}`);
  console.log('Theme Memory data was not modified.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
