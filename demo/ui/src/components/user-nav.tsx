import { Link, useRouter } from "@tanstack/react-router";
import { useAuth } from "everything-dev/runtime/react";
import { useAuthClient } from "../lib/app-context";

export function UserNav() {
	const router = useRouter();
	const authClient = useAuthClient();
	const auth = useAuth();

	const accountId = auth.session?.user?.id;

	const handleSignOut = async () => {
		try {
			await authClient.signOut();
			await authClient.near.disconnect();
			router.invalidate();
			window.location.href = "/";
		} catch (error) {
			console.error("Sign out error:", error);
		}
	};

	if (accountId) {
		return (
			<>
				<span className="text-xs text-muted-foreground font-mono">
					{accountId}
				</span>
				<button
					type="button"
					onClick={handleSignOut}
					className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
				>
					sign out
				</button>
			</>
		);
	}

	return (
		<Link
			to="/login"
			className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
		>
			login
		</Link>
	);
}
