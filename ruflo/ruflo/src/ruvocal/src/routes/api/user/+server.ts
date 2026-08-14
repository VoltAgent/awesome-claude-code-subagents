export async function GET({ locals }) {
	if (locals.user) {
		const res = {
			id: locals.user._id,
			username: locals.user.username,
			name: locals.user.name,
			email: locals.user.email,
			avatarUrl: locals.user.avatarUrl,
			hfUserId: locals.user.hfUserId,
		};

		return Response.json(res);
	}
	return Response.json({ message: "Must be signed in" }, { status: 401 });
}
