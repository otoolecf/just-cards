export function roomRecoveryAction(input:{away:boolean;host:boolean;anyAway:boolean;hostAbsent:boolean;sleeping:boolean}) {
	if (input.away) return 'return';
	if (input.host && !input.anyAway) return 'resume';
	if (!input.host && input.hostAbsent) return 'claim_host';
	if (input.sleeping) return 'check';
	return null;
}
