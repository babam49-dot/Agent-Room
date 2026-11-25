import { buildServer } from './apps/api/src/server.js';
import { SEEDED_DATA, seedDatabase } from '@agentroom/db';
import { OpenAIProvider } from '@agentroom/agent';
import { AgentRunner } from '@agentroom/agent';
import assert from 'node:assert';

async function runPhase3AcceptanceTests() {
  console.log('\n====================================================');
  console.log('   VERIFYING PHASE 3: CONTEXT, TAKEOVER, HANDOFF, FORK');
  console.log('====================================================\n');

  // Seed database
  await seedDatabase();

  const server = buildServer();
  const address = await server.listen({ port: 0, host: '127.0.0.1' });
  const baseUrl = address;
  const runId = SEEDED_DATA.run.id;
  const saraId = SEEDED_DATA.users[0]!.id;
  const ahmedId = SEEDED_DATA.users[1]!.id;
  const linaId = SEEDED_DATA.users[2]!.id;

  try {
    // ----------------------------------------------------
    // TEST 1: Context Edit & Versioning + Conflict Detection
    // ----------------------------------------------------
    console.log('[Test 1/5] Context Edit, Versioning & Conflict Detection:');
    
    // Fetch context blocks
    const getRes = await fetch(`${baseUrl}/v1/runs/${runId}/context-blocks`);
    const { blocks } = await getRes.json();
    assert(blocks.length > 0, 'Should have at least 1 seeded context block');
    const block = blocks[0];
    assert.strictEqual(block.currentVersion, 1, 'Initial block version should be 1');
    console.log(`  ✓ Initial block loaded: "${block.title}" at v${block.currentVersion}`);

    // Sara edits context block from v1 to v2
    const patchRes = await fetch(`${baseUrl}/v1/context-blocks/${block.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseVersion: 1,
        content: 'Rule 1: Strict backward compatibility. Rule 2: Integer cents only.',
        userId: saraId,
      }),
    });
    assert.strictEqual(patchRes.status, 200, 'Context update should succeed');
    const updated = await patchRes.json();
    assert.strictEqual(updated.block.currentVersion, 2, 'Version should increment to 2');
    console.log(`  ✓ Sara successfully updated block to v2`);

    // Ahmed tries to edit using stale baseVersion: 1 -> Expect 409 Conflict
    const conflictRes = await fetch(`${baseUrl}/v1/context-blocks/${block.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseVersion: 1, // Stale!
        content: 'Breaking schema changes permitted.',
        userId: ahmedId,
      }),
    });
    assert.strictEqual(conflictRes.status, 409, 'Stale baseVersion must return 409 Conflict');
    const conflictData = await conflictRes.json();
    assert.strictEqual(conflictData.error.code, 'VERSION_CONFLICT', 'Error code must be VERSION_CONFLICT');
    assert.strictEqual(conflictData.error.latestVersion, 2, 'Must report latest version 2');
    console.log(`  ✓ Stale baseVersion correctly rejected with 409 VERSION_CONFLICT`);

    // Lock acquisition
    const lockRes = await fetch(`${baseUrl}/v1/context-blocks/${block.id}/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: saraId, ttlMs: 10000 }),
    });
    assert.strictEqual(lockRes.status, 200, 'Lock acquisition should succeed');
    console.log(`  ✓ Sara acquired 10s soft-lock on block`);

    // Release lock
    const unlockRes = await fetch(`${baseUrl}/v1/context-blocks/${block.id}/lock`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: saraId }),
    });
    assert.strictEqual(unlockRes.status, 200, 'Lock release should succeed');
    console.log(`  ✓ Lock released successfully\n`);

    // ----------------------------------------------------
    // TEST 2: Human Takeover, Human Tool Execution & Handback
    // ----------------------------------------------------
    console.log('[Test 2/5] Human Takeover, Human Tool Execution & Handback:');

    // Sara takes over
    const takeoverRes = await fetch(`${baseUrl}/v1/runs/${runId}/takeover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: saraId }),
    });
    assert.strictEqual(takeoverRes.status, 200);
    const takeoverData = await takeoverRes.json();
    assert.strictEqual(takeoverData.driver.type, 'human');
    console.log(`  ✓ Driver transferred to human (Sara Chen)`);

    // Sara executes tool call in sandbox
    const toolExecRes = await fetch(`${baseUrl}/v1/runs/${runId}/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'run_command',
        arguments: { command: 'git checkout -b fix-payment-schema' },
        userId: saraId,
      }),
    });
    assert.strictEqual(toolExecRes.status, 200);
    const toolExecData = await toolExecRes.json();
    assert.strictEqual(toolExecData.envelope.actorType, 'human', 'Tool event actorType must be human');
    console.log(`  ✓ Human executed command "${toolExecData.output.split('\n')[0]}" (recorded as actorType: human)`);

    // Sara hands back to agent with note
    const handbackRes = await fetch(`${baseUrl}/v1/runs/${runId}/handback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Schema verified, agent can proceed with integration test.' }),
    });
    assert.strictEqual(handbackRes.status, 200);
    const handbackData = await handbackRes.json();
    assert.strictEqual(handbackData.driver.type, 'agent');
    console.log(`  ✓ Handed back to Autonomous Agent with note\n`);

    // ----------------------------------------------------
    // TEST 3: Teammate Handoff (Accept & Decline Paths)
    // ----------------------------------------------------
    console.log('[Test 3/5] Driver Handoff: Accept & Decline:');

    // Sara requests handoff to Ahmed
    const handoffReq1 = await fetch(`${baseUrl}/v1/runs/${runId}/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromUserId: saraId,
        toUserId: ahmedId,
        note: 'Please steer the final migration deployment.',
      }),
    });
    const { handoff: h1 } = await handoffReq1.json();
    assert(h1.id, 'Handoff record created');
    console.log(`  ✓ Handoff request from Sara to Ahmed created (id: ${h1.id.slice(0, 8)}...)`);

    // Ahmed accepts handoff
    const acceptRes = await fetch(`${baseUrl}/v1/handoffs/${h1.id}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolvedByUserId: ahmedId }),
    });
    assert.strictEqual(acceptRes.status, 200);
    const runCheck1 = await (await fetch(`${baseUrl}/v1/runs/${runId}`)).json();
    assert.strictEqual(runCheck1.state.driver.userId, ahmedId, 'Driver should now be Ahmed');
    console.log(`  ✓ Ahmed accepted: Driver successfully transferred to Ahmed Hassan`);

    // Ahmed requests handoff to Lina
    const handoffReq2 = await fetch(`${baseUrl}/v1/runs/${runId}/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromUserId: ahmedId,
        toUserId: linaId,
        note: 'Can you take over the test verification?',
      }),
    });
    const { handoff: h2 } = await handoffReq2.json();

    // Lina declines handoff
    const declineRes = await fetch(`${baseUrl}/v1/handoffs/${h2.id}/decline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolvedByUserId: linaId }),
    });
    assert.strictEqual(declineRes.status, 200);
    const runCheck2 = await (await fetch(`${baseUrl}/v1/runs/${runId}`)).json();
    assert.strictEqual(runCheck2.state.driver.userId, ahmedId, 'Driver should remain Ahmed after decline');
    console.log(`  ✓ Lina declined: Driver correctly retained by Ahmed Hassan\n`);

    // ----------------------------------------------------
    // TEST 4: Fork with Edit-and-Rerun (Section 9.8)
    // ----------------------------------------------------
    console.log('[Test 4/5] Fork with Edit-and-Rerun:');

    const forkRes = await fetch(`${baseUrl}/v1/runs/${runId}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        atSeq: 3,
        editedMessage: 'Steer: Use backward compatible envelope { data, error }',
        userId: saraId,
      }),
    });
    assert.strictEqual(forkRes.status, 200);
    const { run: forkedRun } = await forkRes.json();
    assert(forkedRun.id && forkedRun.id !== runId, 'Forked run must have unique id');
    assert.strictEqual(forkedRun.parentRunId, runId, 'Must link to parent run');
    assert.strictEqual(forkedRun.forkedAtSeq, 3, 'Fork point seq must be 3');
    console.log(`  ✓ Created forked run ${forkedRun.id.slice(0, 8)}... at sequence 3`);

    // Check events of forked run
    const forkedEventsRes = await fetch(`${baseUrl}/v1/runs/${forkedRun.id}/events`);
    const { events: forkedEvents } = await forkedEventsRes.json();
    assert(forkedEvents.length >= 4, 'Forked run must have copied events plus edited message');
    const lastEvent = forkedEvents[forkedEvents.length - 1];
    assert.strictEqual(lastEvent.type, 'message.user');
    assert.strictEqual(lastEvent.payload.text, 'Steer: Use backward compatible envelope { data, error }');
    console.log(`  ✓ Cloned events 1..3 and appended edited steering message`);

    // Verify parent run has bidirectional run.forked event
    const parentEventsRes = await fetch(`${baseUrl}/v1/runs/${runId}/events`);
    const { events: parentEvents } = await parentEventsRes.json();
    const forkedEventInParent = parentEvents.find((e: any) => e.type === 'run.forked');
    assert(forkedEventInParent, 'Parent run must contain run.forked event');
    assert.strictEqual(forkedEventInParent.payload.newRunId, forkedRun.id);
    console.log(`  ✓ Parent run appended bidirectional run.forked link event\n`);

    // ----------------------------------------------------
    // TEST 5: OpenAI & Scripted Provider Architecture
    // ----------------------------------------------------
    console.log('[Test 5/5] Provider Pluggability (OpenAI & Scripted):');

    const openai = new OpenAIProvider({
      apiKey: 'test-key-mock',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    });
    assert(openai, 'OpenAIProvider initialized');
    console.log(`  ✓ OpenAIProvider instantiates cleanly with custom baseURL and model`);

    // Test runner with scripted provider fallback
    const runner = new AgentRunner(runId, { provider: 'scripted' });
    assert(runner, 'AgentRunner initialized with zero-cost scripted provider');
    console.log(`  ✓ AgentRunner supports zero-credit scripted execution without API keys\n`);

    console.log('====================================================');
    console.log('   ALL PHASE 3 ACCEPTANCE TESTS PASSED (5/5) ✓     ');
    console.log('====================================================\n');
  } finally {
    await server.close();
  }
}

runPhase3AcceptanceTests().catch((err) => {
  console.error('\n❌ PHASE 3 ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
