import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { logServerEvent } from './log';

describe('server log', () => {
	const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
	const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

	beforeEach(() => {
		infoSpy.mockClear();
		errorSpy.mockClear();
	});

	afterEach(() => {
		infoSpy.mockClear();
		errorSpy.mockClear();
	});

	it('log_server_event_redacts_sensitive_fields', () => {
		logServerEvent('test_event', {
			apiKey: 'secret-value',
			token: 'abc',
			visible: 'ok'
		});

		expect(infoSpy).toHaveBeenCalledTimes(1);
		const line = String(infoSpy.mock.calls[0]?.[0] ?? '');
		expect(line).toContain('test_event');
		expect(line).toContain('"apiKey":"[redacted]"');
		expect(line).toContain('"token":"[redacted]"');
		expect(line).toContain('"visible":"ok"');
		expect(line).not.toContain('secret-value');
	});

	it('log_server_event_uses_error_channel', () => {
		logServerEvent('test_error_event', { message: 'boom' }, 'error');
		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(infoSpy).toHaveBeenCalledTimes(0);
	});
});
