#!/usr/bin/env python3
"""Puente de stdin a la API local de Hermes, sin CLI ni gateway."""
import argparse
import contextlib
import inspect
import io
import json
import os
import socket
import sys
import uuid


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--check-runtime', action='store_true')
    args = parser.parse_args()
    if args.check_runtime:
        def no_network(*_args, **_kwargs):
            raise OSError('network disabled during diagnostic')
        socket.socket.connect = no_network
        socket.socket.connect_ex = no_network
        socket.create_connection = no_network
    reason = 'runtime_unavailable'
    try:
        if not os.environ.get('HERMES_HOME') or not os.environ.get('HOME'):
            raise RuntimeError()
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            from hermes_cli.runtime_provider import resolve_runtime_provider
            from run_agent import AIAgent
            kwargs = dict(provider='openai-codex', api_mode='codex_responses',
                          base_url='https://invalid', api_key='placeholder', model=args.model,
                          session_id='office-' + uuid.uuid4().hex, platform='office',
                          enabled_toolsets=[], skip_memory=True, skip_context_files=True,
                          load_soul_identity=False, fallback_model=None, quiet_mode=True,
                          save_trajectories=False)
            inspect.signature(AIAgent).bind(**kwargs)
            inspect.signature(AIAgent.run_conversation).bind(None, 'fixture')
            reason = 'auth_unavailable'
            runtime = resolve_runtime_provider(requested='openai-codex', target_model=args.model)
            reason = 'provider_unavailable'
            if (runtime.get('provider') != 'openai-codex' or
                    runtime.get('api_mode') != 'codex_responses' or
                    not runtime.get('api_key') or not runtime.get('base_url')):
                raise RuntimeError()
            kwargs.update(base_url=runtime['base_url'], api_key=runtime['api_key'])
            reason = 'runtime_unavailable'
            agent = AIAgent(**kwargs)
            reason = 'provider_unavailable'
            if (agent.provider != 'openai-codex' or agent.api_mode != 'codex_responses' or
                    agent.model != args.model or agent._fallback_chain):
                raise RuntimeError()
            if args.check_runtime:
                print(json.dumps({'ready': True, 'reason_code': 'ready'}), file=sys.__stdout__)
                return
            instruction = sys.stdin.read()
            result = agent.run_conversation(instruction)
            if (not isinstance(result, dict) or result.get('failed') or result.get('interrupted') or
                    result.get('partial') or not result.get('completed') or
                    result.get('provider') != 'openai-codex' or result.get('model') != args.model or
                    agent.provider != 'openai-codex' or agent.api_mode != 'codex_responses' or
                    agent.model != args.model or agent._fallback_chain or
                    not isinstance(result.get('final_response'), str)):
                raise RuntimeError()
        sys.stdout.write(result['final_response'])
    except Exception:
        if args.check_runtime:
            print(json.dumps({'ready': False, 'reason_code': reason}))
        else:
            print('Hermes local: proveedor no disponible o ejecución fallida.', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
