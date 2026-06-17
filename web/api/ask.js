/**
 * Vercel serverless function — AI Ask endpoint.
 * POST { question: string, dataset: { games, players } }
 * Returns { answer: string }
 *
 * Flow:
 *   1. Pass the question + schema to Claude → get a plain-language answer
 *      (dataset is small enough to pass directly; no SQL step needed until
 *       the full history is loaded, at which point we switch to text-to-SQL)
 */

const Anthropic = (await import("@anthropic-ai/sdk")).default;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are the stats assistant for a Brooklyn pickup soccer league.
Answer ONLY from the JSON dataset provided. Nicknames are the player identities.
Goals with scorer null are team goals with no individual credit.
A player's team won a game if their team's score is higher.
Be concise, use numbers, and if asked something the data can't answer, say so.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { question, dataset } = req.body ?? {};
  if (!question || !dataset) {
    return res.status(400).json({ error: "Missing question or dataset" });
  }

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: SYSTEM + "\n\nDataset:\n" + JSON.stringify(dataset),
      messages: [{ role: "user", content: question }],
    });

    const answer = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    res.status(200).json({ answer });
  } catch (err) {
    console.error("[ask]", err);
    res.status(500).json({ error: "Model error", detail: err.message });
  }
}
