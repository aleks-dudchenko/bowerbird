# Universal binary so one build serves both Apple Silicon and Intel.
BIN = ../build/zbirka-helper

all: $(BIN)

$(BIN): main.swift
	@mkdir -p ../build
	swiftc -O -target arm64-apple-macos13 -o /tmp/zh-arm64 main.swift
	swiftc -O -target x86_64-apple-macos13 -o /tmp/zh-x64 main.swift
	lipo -create /tmp/zh-arm64 /tmp/zh-x64 -output $(BIN)
	@rm -f /tmp/zh-arm64 /tmp/zh-x64
	@echo "built $(BIN)"

clean:
	rm -f $(BIN)

.PHONY: all clean
