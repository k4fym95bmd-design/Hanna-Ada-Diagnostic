# First-stage launcher-only MIPS libretro core; no system modification.
CC ?= clang
TRIPLE := mipsel-linux-gnu
CFLAGS = -target $(TRIPLE) -march=mips32r2 -O2 -fPIC -fno-builtin -fno-stack-protector -ffreestanding -Wall -Wextra -Werror -std=c11
LDFLAGS = -target $(TRIPLE) -fuse-ld=lld -shared -nostdlib -Wl,--no-undefined -Wl,-soname,libemu_hannaada.so
all: libemu_hannaada.so
libemu_hannaada.so: src/hanna_ada_probe.c
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $<
smoke:
	cc -O2 -Wall -Wextra -Werror -std=c11 -fPIC -shared -o /tmp/hanna_ada_host.so src/hanna_ada_probe.c
	cc -O2 -Wall -Wextra -Werror -std=c11 -o /tmp/hanna_ada_smoke tests/smoke.c -ldl
	/tmp/hanna_ada_smoke /tmp/hanna_ada_host.so
clean:
	rm -f libemu_hannaada.so
.PHONY: all smoke clean
