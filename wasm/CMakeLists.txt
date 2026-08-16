#### Browser WebAssembly Player ####

if(NOT EMSCRIPTEN)
	message(FATAL_ERROR "The vgm-web target requires Emscripten")
endif()

add_executable(vgm-web
	vgm_web.cpp
	strutils_web.c
	"${YAWVGMP_LIBVGM_DIR}/utils/DataLoader.c"
	"${YAWVGMP_LIBVGM_DIR}/utils/MemoryLoader.c"
)
target_include_directories(vgm-web PRIVATE "${YAWVGMP_LIBVGM_DIR}")
target_link_libraries(vgm-web PRIVATE vgm-player vgm-emu vgm-utils)
set_target_properties(vgm-web PROPERTIES
	OUTPUT_NAME "libvgm"
	SUFFIX ".js"
	RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/wasm-module"
)

target_compile_options(vgm-web PRIVATE -O3 -flto)
target_link_options(vgm-web PRIVATE
	-O3
	-flto
	--no-entry
	"SHELL:-s WASM=1"
	"SHELL:-s MODULARIZE=1"
	"SHELL:-s EXPORT_ES6=1"
	"SHELL:-s EXPORT_NAME=createLibVgmModule"
	"SHELL:-s ENVIRONMENT=web,worker"
	"SHELL:-s ALLOW_MEMORY_GROWTH=1"
	"SHELL:-s USE_ZLIB=1"
	"SHELL:-s FILESYSTEM=0"
	"SHELL:-s MALLOC=emmalloc"
	"SHELL:-s ASSERTIONS=0"
	"SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
	"SHELL:-s EXPORTED_RUNTIME_METHODS=['UTF8ToString','HEAPU8','HEAPF32']"
	"SHELL:-s INCOMING_MODULE_JS_API=['wasmBinary','locateFile','noInitialRun','print','printErr']"
)
