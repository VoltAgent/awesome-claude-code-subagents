export type TreeId = string;

export type Tree<T> = {
	rootMessageId?: TreeId;
	messages: TreeNode<T>[];
};

export type TreeNode<T> = T & {
	id: TreeId;
	ancestors?: TreeId[];
	children?: TreeId[];
};

export type NewNode<T> = Omit<TreeNode<T>, "id">;
