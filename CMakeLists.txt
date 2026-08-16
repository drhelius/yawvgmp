cmake_minimum_required(VERSION 3.20)

project(yawvgmp LANGUAGES C CXX)

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_NO_PACKAGE_REGISTRY ON)

set(YAWVGMP_LIBVGM_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/libvgm" CACHE PATH "Path to a drhelius/libvgm checkout")
option(YAWVGMP_BUILD_TESTS "Build native tests for the browser wrapper" OFF)

set(BUILD_LIBAUDIO OFF CACHE BOOL "" FORCE)
set(BUILD_LIBEMU ON CACHE BOOL "" FORCE)
set(BUILD_LIBPLAYER ON CACHE BOOL "" FORCE)
set(BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(BUILD_PLAYER OFF CACHE BOOL "" FORCE)
set(BUILD_VGM2WAV OFF CACHE BOOL "" FORCE)
set(UTIL_LOADERS OFF CACHE BOOL "" FORCE)
set(UTIL_THREADING OFF CACHE BOOL "" FORCE)
set(UTIL_CHARSET_CONV OFF CACHE BOOL "" FORCE)
set(SNDEMU__ALL ON CACHE BOOL "" FORCE)
set(REALLY_NEED_CXX14 ON CACHE BOOL "" FORCE)
set(USE_SANITIZERS OFF CACHE BOOL "" FORCE)
set(LIBRARY_TYPE STATIC CACHE STRING "" FORCE)

get_filename_component(YAWVGMP_LIBVGM_DIR "${YAWVGMP_LIBVGM_SOURCE_DIR}" ABSOLUTE)
if(NOT EXISTS "${YAWVGMP_LIBVGM_DIR}/player/vgmplayer.cpp")
	message(FATAL_ERROR
		"libvgm was not found at ${YAWVGMP_LIBVGM_DIR}. "
		"Run 'git submodule update --init --recursive' or set YAWVGMP_LIBVGM_SOURCE_DIR."
	)
endif()
add_subdirectory("${YAWVGMP_LIBVGM_DIR}" "${CMAKE_BINARY_DIR}/libvgm")

target_sources(vgm-utils PRIVATE wasm/utils_stub.c)

if(EMSCRIPTEN)
	add_subdirectory(wasm)
endif()

if(YAWVGMP_BUILD_TESTS)
	if(EMSCRIPTEN)
		message(FATAL_ERROR "YAWVGMP_BUILD_TESTS is for native wrapper tests")
	endif()
	find_package(ZLIB REQUIRED)
	enable_testing()
	add_executable(yawvgmp-wrapper-test
		wasm/vgm_web.cpp
		wasm/strutils_web.c
		tests/wasm_wrapper_test.cpp
		"${YAWVGMP_LIBVGM_DIR}/utils/DataLoader.c"
		"${YAWVGMP_LIBVGM_DIR}/utils/MemoryLoader.c"
	)
	target_include_directories(yawvgmp-wrapper-test PRIVATE "${YAWVGMP_LIBVGM_DIR}")
	target_link_libraries(yawvgmp-wrapper-test PRIVATE ZLIB::ZLIB vgm-player vgm-emu vgm-utils)
	add_test(NAME yawvgmp-wrapper-test COMMAND yawvgmp-wrapper-test)
endif()
