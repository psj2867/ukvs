import { alg, Graph } from "@dagrejs/graphlib";
import { Members } from "./members";
import { Storage } from "./storage";

/**
 * @param {Storage} storage
 */
function makeGraph(storage, allMembers) {
  let g = new Graph();
  let memberIds = allMembers.map(([k, v]) => k);
  g.setNodes(memberIds);
  const notInMemberIds = (id) => memberIds.indexOf(id) < 0;
  let conns = storage.findSpecial("conn_");
  for (const conn of conns) {
    let k = conn.key.slice("conn_".length);
    if (notInMemberIds(k)) continue;
    for (const t of conn.data) {
      if (notInMemberIds(t)) continue;
      g.setEdge(k, t);
    }
  }
  return g;
}

/**
 * @param {Members} members
 */
export function caculateLongestDistance(storage, members) {
  let allMembers = members.getAllMemberList();
  let g = makeGraph(storage, allMembers);
  let dijks = alg.dijkstra(g, members.myUserUUID);
  let distances = Object.entries(dijks)
    .map(([id, v]) => v.distance)
    .filter((v) => isFinite(v));

  return Math.max(0, Math.max(...distances));
}

/**
 * @param {Storage} storage
 * @param {Members} members
 */
export function getNodeDistance(myId, storage, members) {
  let g = makeGraph(storage, members.getAllMemberList());
  let dijks = alg.dijkstra(g, myId);

  return dijks;
}
