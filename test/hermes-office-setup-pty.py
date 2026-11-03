import os, pty, select, signal, sys, time
signal_test = sys.argv[-1] == '--signal-test'
if signal_test: sys.argv.pop()
pid, fd = pty.fork()
if pid == 0:
    os.execv(sys.argv[1], sys.argv[1:])
data = bytearray()
while True:
    ready, _, _ = select.select([fd], [], [], 0.1)
    if ready:
        try:
            chunk = os.read(fd, 8192)
        except OSError:
            break
        if not chunk:
            break
        data.extend(chunk)
        if signal_test and b'FIXTURE_WAIT' in data:
            os.kill(pid, signal.SIGINT)
            signal_test = False
_, status = os.waitpid(pid, 0)
sys.stdout.buffer.write(data)
sys.exit(os.waitstatus_to_exitcode(status))
