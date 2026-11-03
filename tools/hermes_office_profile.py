"""Bootstrap efímero del directorio vacío que exige Hermes."""
import contextlib
import os
import stat


class ProfileError(Exception):
    pass


def _private_directory(path):
    if not os.path.isabs(path) or os.path.normpath(path) != path or os.path.realpath(path) != path:
        raise ProfileError()
    st = os.lstat(path)
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid() or st.st_mode & 0o077:
        raise ProfileError()
    return st


def _identity(st):
    return (st.st_dev, st.st_ino, st.st_uid)


@contextlib.contextmanager
def bootstrap_profile():
    home = os.environ.get('HOME', '')
    hermes = os.environ.get('HERMES_HOME', '')
    if not home or hermes != os.path.join(home, 'hermes'):
        raise ProfileError()
    home_stat = _private_directory(home)
    hermes_stat = _private_directory(hermes)
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    home_fd = os.open(hermes, flags)
    hooks_fd = None
    try:
        if _identity(os.fstat(home_fd)) != _identity(hermes_stat):
            raise ProfileError()
        try:
            os.lstat('hooks', dir_fd=home_fd)
        except FileNotFoundError:
            pass
        else:
            raise ProfileError()
        os.mkdir('hooks', 0o700, dir_fd=home_fd)
        hooks_fd = os.open('hooks', flags, dir_fd=home_fd)
        created = os.fstat(hooks_fd)
        if not stat.S_ISDIR(created.st_mode) or created.st_uid != os.getuid() or stat.S_IMODE(created.st_mode) != 0o700:
            raise ProfileError()
        try:
            yield
        finally:
            current_home = _private_directory(home)
            current_hermes = _private_directory(hermes)
            current = os.lstat('hooks', dir_fd=home_fd)
            if (_identity(current_home) != _identity(home_stat) or
                    _identity(current_hermes) != _identity(hermes_stat) or
                    not stat.S_ISDIR(current.st_mode) or
                    _identity(current) != _identity(created) or
                    stat.S_IMODE(current.st_mode) != 0o700 or
                    os.listdir(hooks_fd)):
                raise ProfileError()
            os.rmdir('hooks', dir_fd=home_fd)
            for name in ('config.yaml', '.env', 'hooks', 'plugins', 'mcp.json'):
                try:
                    os.lstat(name, dir_fd=home_fd)
                except FileNotFoundError:
                    continue
                raise ProfileError()
    finally:
        if hooks_fd is not None:
            os.close(hooks_fd)
        os.close(home_fd)
