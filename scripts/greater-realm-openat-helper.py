import errno
import os
import stat
import sys

MAX_FILE_BYTES = 512 * 1024 * 1024


def die():
    os._exit(70)


def exact_directory(fd):
    value = os.fstat(fd)
    if not stat.S_ISDIR(value.st_mode) or value.st_uid != os.getuid():
        die()
    if stat.S_IMODE(value.st_mode) != 0o700 or value.st_mode & 0o7000:
        die()


def components(value):
    if not isinstance(value, str) or not 0 < len(value) <= 4096:
        die()
    if value.startswith('/') or value.endswith('/') or '\\' in value:
        die()
    result = value.split('/')
    for component in result:
        if not 0 < len(component) <= 255 or component in ('.', '..'):
            die()
        if any(ord(character) < 0x20 or ord(character) == 0x7f for character in component):
            die()
    return result


def open_parent(root_fd, path):
    values = components(path)
    current = os.dup(root_fd)
    try:
        for component in values[:-1]:
            try:
                following = os.open(
                    component,
                    os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                    dir_fd=current,
                )
            except FileNotFoundError:
                os.mkdir(component, 0o700, dir_fd=current)
                os.fsync(current)
                following = os.open(
                    component,
                    os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                    dir_fd=current,
                )
            exact_directory(following)
            os.close(current)
            current = following
        return current, values[-1]
    except BaseException:
        os.close(current)
        raise


def parse_mode(value):
    if value not in ('600', '644', '700'):
        die()
    return int(value, 8)


def parse_size(value):
    if not value.isascii() or not value.isdecimal():
        die()
    parsed = int(value, 10)
    if parsed < 0 or parsed > MAX_FILE_BYTES:
        die()
    return parsed


def write_file(root_fd, path, mode, expected_size):
    parent, leaf = open_parent(root_fd, path)
    output = None
    try:
        # The final leaf is also the crash-recovery identity. Bypass the
        # inherited operator umask so a SIGKILL immediately after O_EXCL still
        # leaves the exact declared mode rather than an unauthorised 0600/0640
        # partial that cannot be classified safely.
        previous_umask = os.umask(0)
        try:
            output = os.open(
                leaf,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW,
                mode,
                dir_fd=parent,
            )
        finally:
            os.umask(previous_umask)
        total = 0
        while True:
            body = os.read(sys.stdin.fileno(), min(65536, expected_size - total + 1))
            if not body:
                break
            total += len(body)
            if total > expected_size:
                die()
            offset = 0
            while offset < len(body):
                offset += os.write(output, body[offset:])
        if total != expected_size:
            die()
        os.fchmod(output, mode)
        os.fsync(output)
        value = os.fstat(output)
        if not stat.S_ISREG(value.st_mode) or value.st_uid != os.getuid() or value.st_nlink != 1:
            die()
        if stat.S_IMODE(value.st_mode) != mode or value.st_mode & 0o7000:
            die()
        if value.st_size != expected_size:
            die()
        os.close(output)
        output = None
        os.fsync(parent)
    finally:
        if output is not None:
            os.close(output)
        os.close(parent)


def make_directory(root_fd, path):
    parent, leaf = open_parent(root_fd, path)
    directory = None
    try:
        try:
            os.mkdir(leaf, 0o700, dir_fd=parent)
        except FileExistsError:
            pass
        directory = os.open(
            leaf,
            os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
            dir_fd=parent,
        )
        exact_directory(directory)
        os.fsync(directory)
        os.close(directory)
        directory = None
        os.fsync(parent)
    finally:
        if directory is not None:
            os.close(directory)
        os.close(parent)


def normalized_target(destination, target):
    if not 0 < len(target) <= 4096 or target.startswith('/') or '\\' in target:
        die()
    result = components(destination)[:-1]
    for component in target.split('/'):
        if component in ('', '.'):
            if component == '':
                die()
            continue
        if component == '..':
            if not result:
                die()
            result.pop()
            continue
        components(component)
        result.append(component)
    if not result:
        die()
    return '/'.join(result)


def make_symlink(root_fd, path, target, expected_root_relative):
    components(expected_root_relative)
    if normalized_target(path, target) != expected_root_relative:
        die()
    parent, leaf = open_parent(root_fd, path)
    try:
        os.symlink(target, leaf, dir_fd=parent)
        value = os.stat(leaf, dir_fd=parent, follow_symlinks=False)
        if not stat.S_ISLNK(value.st_mode) or value.st_uid != os.getuid():
            die()
        if os.readlink(leaf, dir_fd=parent) != target:
            die()
        os.fsync(parent)
    finally:
        os.close(parent)


def main():
    if len(sys.argv) < 3:
        die()
    root_fd = 3
    exact_directory(root_fd)
    operation = sys.argv[1]
    path = sys.argv[2]
    components(path)
    if operation == 'write' and len(sys.argv) == 5:
        write_file(root_fd, path, parse_mode(sys.argv[3]), parse_size(sys.argv[4]))
    elif operation == 'mkdir' and len(sys.argv) == 3:
        make_directory(root_fd, path)
    elif operation == 'symlink' and len(sys.argv) == 5:
        make_symlink(root_fd, path, sys.argv[3], sys.argv[4])
    else:
        die()


try:
    main()
except BaseException:
    die()
