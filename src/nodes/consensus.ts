import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";

interface Message {
  k: number;
  x: Value;
  messageType: "PROPOSAL" | "VOTE";
}

interface NodeState {
  killed: boolean;
  x: Value | null;
  decided: boolean | null;
  k: number | null;
}

export async function startConsensus(N: number) {
  // Start consensus on all nodes
  for (let index = 0; index < N; index++) {
    await fetch(`http://localhost:${BASE_NODE_PORT + index}/start`);
  }
}

export async function stopConsensus(N: number) {
  // Stop consensus on all nodes
  for (let index = 0; index < N; index++) {
    await fetch(`http://localhost:${BASE_NODE_PORT + index}/stop`);
  }
}

// Helper function to get node state
async function getNodeState(nodeId: number): Promise<NodeState> {
  const response = await fetch(`http://localhost:${BASE_NODE_PORT + nodeId}/getState`);
  return response.json() as Promise<NodeState>;
}

// Helper function to send message to a node
async function sendMessage(toNodeId: number, message: Message) {
  try {
    await fetch(`http://localhost:${BASE_NODE_PORT + toNodeId}/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });
  } catch (error) {
    console.error(`Failed to send message to node ${toNodeId}:`, error);
  }
}

// Helper function to check if consensus is reached
async function checkConsensus(N: number): Promise<boolean> {
  const states = await Promise.all(
    Array.from({ length: N }, (_, i) => getNodeState(i))
  );
  
  // Check if all non-faulty nodes have decided
  const decidedNodes = states.filter((state: NodeState) => state.decided !== null);
  return decidedNodes.length === N;
}

// Helper function to get majority value
function getMajorityValue(messages: Message[]): Value {
  const counts = new Map<Value, number>();
  messages.forEach(msg => {
    counts.set(msg.x, (counts.get(msg.x) || 0) + 1);
  });
  
  let maxCount = 0;
  let majorityValue: Value = 0;
  
  counts.forEach((count, value) => {
    if (count > maxCount) {
      maxCount = count;
      majorityValue = value;
    }
  });
  
  return majorityValue;
}

// Helper function to simulate random coin flip
function randomCoinFlip(): Value {
  return Math.random() < 0.5 ? 0 : 1;
}
