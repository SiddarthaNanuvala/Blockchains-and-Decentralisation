import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";

// Node state
interface NodeState {
  killed: boolean;
  x: Value | null;
  decided: boolean | null;
  k: number | null;
}

export async function node(
  nodeId: number,
  N: number,
  F: number,
  initialValue: Value,
  isFaulty: boolean,
  nodesAreReady: () => boolean,
  setNodeIsReady: (index: number) => void
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  // Initialize node state
  let nodeState: NodeState = {
    killed: false,
    x: null,
    decided: null,
    k: null
  };

  // Message tracking for each round
  let roundRMessages: Map<number, Value[]> = new Map();
  let roundPMessages: Map<number, Value[]> = new Map();

  function setNodeState(x: number, decided: boolean) {
    nodeState.x = x as Value;
    nodeState.decided = decided;
  }

  // Status endpoint
  node.get("/status", (req, res) => {
    if (isFaulty) {
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });

  // Message endpoint
  node.post("/message", async (req, res) => {
    let { R, k, x } = req.body;
    if (!isFaulty && !nodeState.killed) {
      if (R === "R") {
        let roundRProcessedMessages = processMessage(roundRMessages, k, x);
        if (roundRProcessedMessages.length >= (N - F)) {
          const { countValues0, countValues1 } = countValues(roundRProcessedMessages);
          let v: Value = "?" as Value;
          if (countValues0 > (N / 2)) {
            v = 0;
          } else if (countValues1 > (N / 2)) {
            v = 1;
          } else {
            // If no majority, randomly choose
            v = Math.random() < 0.5 ? 0 : 1;
          }
          await sendAllMessage("P", k, v, N);
        }
      } else if (R === "P") {
        let roundPProcessedMessages = processMessage(roundPMessages, k, x);
        if (roundPProcessedMessages.length >= N - F) {
          const { countValues0, countValues1 } = countValues(roundPProcessedMessages);
          // Check if we've exceeded the fault tolerance threshold
          if (F * 3 > N) {
            // Too many faulty nodes, can't reach consensus
            nodeState.x = countValues0 > countValues1 ? 0 : 1;
            nodeState.k = k + 1;
            nodeState.decided = false;
            if (k <= 10) {
              await sendAllMessage("R", k + 1, nodeState.x, N);
            }
          } else {
            // Normal consensus logic
            if (countValues0 >= F + 1) {
              setNodeState(0, true);
            } else if (countValues1 >= F + 1) {
              setNodeState(1, true);
            } else {
              // If we have enough messages but no clear majority
              const totalValues = countValues0 + countValues1;
              if (totalValues >= N - F) {
                // If we have enough non-faulty nodes agreeing
                if (countValues0 > countValues1) {
                  setNodeState(0, true);
                } else if (countValues1 > countValues0) {
                  setNodeState(1, true);
                } else {
                  // Equal counts, randomly choose
                  nodeState.x = Math.random() > 0.5 ? 0 : 1;
                  nodeState.k = k + 1;
                  await sendAllMessage("R", k + 1, nodeState.x, N);
                }
              } else {
                // Not enough messages, continue with random choice
                nodeState.x = Math.random() > 0.5 ? 0 : 1;
                nodeState.k = k + 1;
                await sendAllMessage("R", k + 1, nodeState.x, N);
              }
            }
          }
        }
      }
      res.status(200).send("message");
    } else {
      res.status(500).send("faulty");
    }
  });

  // Start consensus endpoint
  node.get("/start", async (req, res) => {
    if (!isFaulty) {
      nodeState.decided = false;
      nodeState.x = initialValue;
      nodeState.k = 1;
      await sendAllMessage("R", nodeState.k, nodeState.x, N);
    }
    res.status(200).send("started");
  });

  // Stop consensus endpoint
  node.get("/stop", (req, res) => {
    nodeState.killed = true;
    res.status(200).send("stopped");
  });

  // Get state endpoint
  node.get("/getState", (req, res) => {
    if (isFaulty) {
      nodeState.x = null;
      nodeState.k = null;
      nodeState.decided = null;
    }
    res.status(200).json({
      x: nodeState.x,
      k: nodeState.k,
      killed: nodeState.killed,
      decided: nodeState.decided
    });
  });

  // Start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(`Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`);
    setNodeIsReady(nodeId);
  });

  return server;
}

// Helper function to send messages to all nodes
async function sendAllMessage(R: string, k: number, x: Value, N: number) {
  const promises = Array.from({ length: N }, (_, i) =>
    fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ R, k, x })
    })
  );
  await Promise.all(promises);
}

// Helper function to process and store messages for a round
function processMessage(messages: Map<number, Value[]>, k: number, x: Value): Value[] {
  const messageArray = messages.get(k) || [];
  messageArray.push(x);
  messages.set(k, messageArray);
  return messageArray;
}

// Helper function to count values in an array
function countValues(array: Value[]) {
  let countValues0 = array.filter((value) => value === 0).length;
  let countValues1 = array.filter((value) => value === 1).length;
  return { countValues0, countValues1 };
}
