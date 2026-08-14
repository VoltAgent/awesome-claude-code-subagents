import { v4 } from "uuid";
import type { Tree, TreeId, NewNode, TreeNode } from "./tree";

export function addSibling<T>(conv: Tree<T>, message: NewNode<T>, siblingId: TreeId): TreeId {
	if (conv.messages.length === 0) {
		throw new Error("Cannot add a sibling to an empty conversation");
	}
	if (!conv.rootMessageId) {
		throw new Error("Cannot add a sibling to a legacy conversation");
	}

	const sibling = conv.messages.find((m) => m.id === siblingId);

	if (!sibling) {
		throw new Error("The sibling message doesn't exist");
	}

	if (!sibling.ancestors || sibling.ancestors?.length === 0) {
		throw new Error("The sibling message is the root message, therefore we can't add a sibling");
	}

	const messageId = v4();

	conv.messages.push({
		...message,
		id: messageId,
		ancestors: sibling.ancestors,
		children: [],
	} as TreeNode<T>);

	const nearestAncestorId = sibling.ancestors[sibling.ancestors.length - 1];
	const nearestAncestor = conv.messages.find((m) => m.id === nearestAncestorId);

	if (nearestAncestor) {
		if (nearestAncestor.children) {
			nearestAncestor.children.push(messageId);
		} else nearestAncestor.children = [messageId];
	}

	return messageId;
}
