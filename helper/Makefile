# Universal binary so one build serves both Apple Silicon and Intel.
#
# -strict-concurrency=complete on purpose: a newer local toolchain accepted
# captured-and-mutated state inside a Task that the CI runner rejected
# outright, so the first anyone knew of it was a red build. Compile the
# strict way everywhere and the machines agree.
BIN = ../build/bowerbird-helper
FLAGS = -O -strict-concurrency=complete

all: $(BIN)

$(BIN): main.swift
	@mkdir -p ../build
	swiftc $(FLAGS) -target arm64-apple-macos13 -o /tmp/zh-arm64 main.swift
	swiftc $(FLAGS) -target x86_64-apple-macos13 -o /tmp/zh-x64 main.swift
	lipo -create /tmp/zh-arm64 /tmp/zh-x64 -output $(BIN)
	@rm -f /tmp/zh-arm64 /tmp/zh-x64
	@echo "built $(BIN)"

clean:
	rm -f $(BIN)

.PHONY: all clean
