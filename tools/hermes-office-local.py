#!/usr/bin/env python3
"""Puente de stdin a la API local de Hermes, sin invocar su CLI ni gateway."""
import argparse
import contextlib
import io
import os
import sys
import uuid


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    args = parser.parse_args()
    if not os.environ.get('HERMES_HOME') or not os.environ.get('HOME'):
        raise RuntimeError('Falta el aislamiento de proyecto.')
    instruction = sys.stdin.read()
    # La resolución explícita falla cerrada si no hay OAuth propio del proyecto.
    # Las salidas y excepciones internas pueden contener información sensible.
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        from hermes_cli.runtime_provider import resolve_runtime_provider
        runtime = resolve_runtime_provider(requested='openai-codex', target_model=args.model)
        if (runtime.get('provider') != 'openai-codex' or
                runtime.get('api_mode') != 'codex_responses' or
                not runtime.get('api_key')):
            raise RuntimeError('Proveedor no disponible.')
        from run_agent import AIAgent
        agent = AIAgent(provider='openai-codex', api_mode='codex_responses',
                        base_url=runtime['base_url'], api_key=runtime['api_key'],
                        model=args.model, session_id='office-' + uuid.uuid4().hex,
                        platform='office', enabled_toolsets=[], skip_memory=True,
                        skip_context_files=True, load_soul_identity=False,
                        fallback_model=None, quiet_mode=True, save_trajectories=False)
        if agent.provider != 'openai-codex' or agent.api_mode != 'codex_responses' or agent._fallback_chain:
            raise RuntimeError('Proveedor o fallback no válidos.')
        result = agent.run_conversation(instruction)
    if (result.get('failed') or result.get('interrupted') or result.get('partial') or
            not result.get('completed') or result.get('provider') != 'openai-codex' or
            result.get('model') != args.model or not isinstance(result.get('final_response'), str)):
        raise RuntimeError('Hermes no completó la tarea.')
    sys.stdout.write(result['final_response'])


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Hermes local: proveedor no disponible o ejecución fallida.', file=sys.stderr)
        sys.exit(1)
