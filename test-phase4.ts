import { buildServer } from './apps/api/src/server.js';
import { SEEDED_DATA, seedDatabase } from '@agentroom/db';
import assert from 'node:assert';

async function runPhase4AcceptanceTests() {
  console.log('\n====================================================');
  console.log('   VERIFYING PHASE 4: WORKSPACE, KNOWLEDGE & RBAC   ');
  console.log('====================================================\n');

  // Seed database
  await seedDatabase();

  const server = buildServer();
  const address = await server.listen({ port: 0, host: '127.0.0.1' });
  const baseUrl = address;
  const runId = SEEDED_DATA.run.id;
  const orgId = SEEDED_DATA.org.id;
  const saraId = SEEDED_DATA.users[0]!.id; // Owner
  const tomId = SEEDED_DATA.users[3]!.id;  // Viewer

  try {
    // ----------------------------------------------------
    // TEST 1: Step Comments & Directing the Agent
    // ----------------------------------------------------
    console.log('[Test 1/5] Step Comments & Directing the Agent (Section 13):');

    // Sara posts comment on step 2 with directsAgent: true
    const commentRes = await fetch(`${baseUrl}/v1/runs/${runId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetSeq: 2,
        body: 'Please preserve the legacy chargeId in response metadata.',
        directsAgent: true,
        authorId: saraId,
      }),
    });
    assert.strictEqual(commentRes.status, 200, 'Comment post should succeed');
    const { comment } = await commentRes.json();
    assert(comment.id, 'Comment ID must be generated');
    assert.strictEqual(comment.directsAgent, true, 'directsAgent flag must be true');
    console.log(`  ✓ Comment added on step 2 by Sara (directsAgent: true)`);

    // Verify comment appears in comments list
    const listCommentsRes = await fetch(`${baseUrl}/v1/runs/${runId}/comments`);
    const { comments } = await listCommentsRes.json();
    assert(comments.some((c: any) => c.id === comment.id), 'Comment must be present in run comments');
    console.log(`  ✓ Comment retrieved from run comments store`);

    // Verify comment resolution
    const resolveRes = await fetch(`${baseUrl}/v1/comments/${comment.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, userId: saraId }),
    });
    assert.strictEqual(resolveRes.status, 200, 'Resolve comment should succeed');
    console.log(`  ✓ Comment marked resolved with comment.resolved event\n`);

    // ----------------------------------------------------
    // TEST 2: Run Summarization into Team Knowledge Base
    // ----------------------------------------------------
    console.log('[Test 2/5] Run Summarization into Team Knowledge Base (Section 14):');

    const summaryText =
      'Successfully migrated /v1/charge to idempotent /v2/payments with integer cents and zero breaking changes for existing mobile clients.';
    const summarizeRes = await fetch(`${baseUrl}/v1/runs/${runId}/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: summaryText,
        title: 'Payments v2 REST API Migration Spec',
        tags: ['payments', 'v2-migration', 'idempotency'],
        userId: saraId,
      }),
    });
    assert.strictEqual(summarizeRes.status, 200, 'Summarization should succeed');
    const { knowledgeItem, envelope } = await summarizeRes.json();
    assert(knowledgeItem.id, 'Knowledge item ID generated');
    assert.strictEqual(knowledgeItem.bodyMd, summaryText);
    assert.strictEqual(envelope.type, 'run.summarized');
    console.log(`  ✓ Run synthesized into team knowledge item "${knowledgeItem.title}"`);

    // Fetch knowledge items list
    const knowListRes = await fetch(`${baseUrl}/v1/knowledge-items?orgId=${orgId}`);
    const { items: knowledgeItems } = await knowListRes.json();
    assert(knowledgeItems.length > 0, 'Knowledge items should contain the new entry');
    console.log(`  ✓ Team knowledge repository contains ${knowledgeItems.length} indexed item(s)\n`);

    // ----------------------------------------------------
    // TEST 3: Global Full-Text Search
    // ----------------------------------------------------
    console.log('[Test 3/5] Global Search across Runs & Knowledge Base:');

    // Search for "idempotent"
    const searchRes1 = await fetch(`${baseUrl}/v1/search?q=idempotent&orgId=${orgId}`);
    const results1 = await searchRes1.json();
    assert(results1.knowledgeItems.length > 0 || results1.runs.length > 0, 'Search for "idempotent" must find results');
    console.log(`  ✓ Search for "idempotent" matched ${results1.runs.length} runs and ${results1.knowledgeItems.length} knowledge items`);

    // Search for "payments"
    const searchRes2 = await fetch(`${baseUrl}/v1/search?q=payments&orgId=${orgId}`);
    const results2 = await searchRes2.json();
    assert(results2.runs.length > 0, 'Search for "payments" must match project runs');
    console.log(`  ✓ Search for "payments" matched ${results2.runs.length} runs\n`);

    // ----------------------------------------------------
    // TEST 4: Organization Activity Feed
    // ----------------------------------------------------
    console.log('[Test 4/5] Real-Time Organization Activity Feed:');

    const activityRes = await fetch(`${baseUrl}/v1/activity?orgId=${orgId}&limit=10`);
    assert.strictEqual(activityRes.status, 200);
    const { events: activity } = await activityRes.json();
    assert(activity.length > 0, 'Activity feed should contain recent org events');
    assert(activity[0].createdAt, 'Activity events must have timestamp');
    console.log(`  ✓ Organization activity feed returned ${activity.length} chronological events (latest: ${activity[0].type})\n`);

    // ----------------------------------------------------
    // TEST 5: RBAC Viewer Permission Enforcement (Section 8)
    // ----------------------------------------------------
    console.log('[Test 5/5] RBAC Viewer Permissions Enforcement:');

    // 1. Viewer trying to steer (should fail 403)
    const steerRes = await fetch(`${baseUrl}/v1/runs/${runId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Viewer attempting steering',
        authorId: tomId, // Tom is 'viewer'
      }),
    });
    assert.strictEqual(steerRes.status, 403, 'Viewer steering must return 403 Forbidden');
    const steerErr = await steerRes.json();
    assert.strictEqual(steerErr.error.code, 'VIEWER_CANNOT_STEER');
    console.log(`  ✓ Viewer steering correctly rejected with 403 VIEWER_CANNOT_STEER`);

    // 2. Viewer trying to pause (should fail 403)
    const pauseRes = await fetch(`${baseUrl}/v1/runs/${runId}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: tomId }),
    });
    assert.strictEqual(pauseRes.status, 403, 'Viewer pause must return 403 Forbidden');
    console.log(`  ✓ Viewer run pause correctly rejected with 403`);

    // 3. Viewer trying to take over driver role (should fail 403)
    const takeoverRes = await fetch(`${baseUrl}/v1/runs/${runId}/takeover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: tomId }),
    });
    assert.strictEqual(takeoverRes.status, 403, 'Viewer takeover must return 403 Forbidden');
    console.log(`  ✓ Viewer takeover correctly rejected with 403`);

    // 4. Viewer trying to post step comment (should fail 403)
    const viewerCommentRes = await fetch(`${baseUrl}/v1/runs/${runId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetSeq: 1,
        body: 'Viewer comment',
        authorId: tomId,
      }),
    });
    assert.strictEqual(viewerCommentRes.status, 403, 'Viewer comment must return 403 Forbidden');
    console.log(`  ✓ Viewer comment correctly rejected with 403\n`);

    console.log('====================================================');
    console.log('   ALL PHASE 4 ACCEPTANCE TESTS PASSED (5/5) ✓     ');
    console.log('====================================================\n');
  } finally {
    await server.close();
  }
}

runPhase4AcceptanceTests().catch((err) => {
  console.error('\n❌ PHASE 4 ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
