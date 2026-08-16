#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <vector>
#include <zlib.h>

#include "../wasm/vgm_web.h"

static void Write32(std::vector<unsigned char>& data, size_t offset, unsigned int value)
{
	data[offset + 0] = (unsigned char)(value >> 0);
	data[offset + 1] = (unsigned char)(value >> 8);
	data[offset + 2] = (unsigned char)(value >> 16);
	data[offset + 3] = (unsigned char)(value >> 24);
}

static void AppendUtf16(std::vector<unsigned char>& data, const char* text)
{
	while (*text != '\0')
	{
		data.push_back((unsigned char)*text ++);
		data.push_back(0);
	}
	data.push_back(0);
	data.push_back(0);
}

static std::vector<unsigned char> MakeVgm(void)
{
	std::vector<unsigned char> data(0x42, 0);
	memcpy(&data[0], "Vgm ", 4);
	Write32(data, 0x08, 0x00000150);
	Write32(data, 0x0C, 3579545);
	Write32(data, 0x14, 0x2E);
	Write32(data, 0x18, 735);
	data[0x40] = 0x62;
	data[0x41] = 0x66;

	size_t gd3Offset = data.size();
	data.push_back('G');
	data.push_back('d');
	data.push_back('3');
	data.push_back(' ');
	for (unsigned int index = 0; index < 8; index ++)
		data.push_back(0);
	size_t payloadOffset = data.size();
	AppendUtf16(data, "Test Track");
	for (unsigned int field = 1; field < 11; field ++)
		AppendUtf16(data, "");
	Write32(data, gd3Offset + 4, 0x00000100);
	Write32(data, gd3Offset + 8, (unsigned int)(data.size() - payloadOffset));
	Write32(data, 0x04, (unsigned int)data.size() - 4);
	return data;
}

static std::vector<unsigned char> MakeGzip(const std::vector<unsigned char>& source)
{
	z_stream stream;
	memset(&stream, 0, sizeof(stream));
	assert(deflateInit2(&stream, Z_BEST_COMPRESSION, Z_DEFLATED, 15 + 16, 8, Z_DEFAULT_STRATEGY) == Z_OK);
	std::vector<unsigned char> output(compressBound(source.size()) + 32);
	stream.next_in = (Bytef*)&source[0];
	stream.avail_in = (uInt)source.size();
	stream.next_out = (Bytef*)&output[0];
	stream.avail_out = (uInt)output.size();
	assert(deflate(&stream, Z_FINISH) == Z_STREAM_END);
	output.resize(stream.total_out);
	deflateEnd(&stream);
	return output;
}

static void LoadAndExercise(const std::vector<unsigned char>& file)
{
	void* handle = vgm_web_create(48000, 2048);
	assert(handle != NULL);
	void* bytes = vgm_web_alloc_file((unsigned int)file.size());
	assert(bytes != NULL);
	memcpy(bytes, &file[0], file.size());
	assert(vgm_web_load(handle, bytes, (unsigned int)file.size()) == VGM_WEB_OK);
	assert(strcmp(vgm_web_get_metadata(handle, VGM_WEB_META_TITLE), "Test Track") == 0);
	unsigned int chipCount = vgm_web_get_chip_count(handle);
	if (chipCount != 1)
		fprintf(stderr, "unexpected chip count: %u\n", chipCount);
	assert(chipCount == 1);
	assert(vgm_web_get_duration(handle) > 0.01);
	assert(vgm_web_get_duration(handle) < 0.02);
	assert(vgm_web_start(handle) == VGM_WEB_OK);
	float output[256 * 2];
	assert(vgm_web_render(handle, output, 256) == 256);
	assert(vgm_web_get_position(handle) > 0.0);
	assert(vgm_web_pause(handle) == VGM_WEB_OK);
	double pausedPosition = vgm_web_get_position(handle);
	vgm_web_render(handle, output, 256);
	assert(vgm_web_get_position(handle) == pausedPosition);
	assert(vgm_web_seek(handle, 0.0) == VGM_WEB_OK);
	assert(vgm_web_stop(handle) == VGM_WEB_OK);
	assert(vgm_web_get_position(handle) == 0.0);
	vgm_web_destroy(handle);
}

int main(void)
{
	int registryResult = vgm_web_validate_registry();
	if (registryResult != 1)
		fprintf(stderr, "registry validation failed: %d\n", registryResult);
	assert(registryResult == 1);
	assert(vgm_web_get_registered_device_count() >= 40);
	assert(vgm_web_get_registered_core_count() >= vgm_web_get_registered_device_count());
	std::vector<unsigned char> vgm = MakeVgm();
	LoadAndExercise(vgm);
	LoadAndExercise(MakeGzip(vgm));

	void* handle = vgm_web_create(44100, 128);
	void* badData = vgm_web_alloc_file(4);
	memcpy(badData, "nope", 4);
	assert(vgm_web_load(handle, badData, 4) != VGM_WEB_OK);
	vgm_web_destroy(handle);
	puts("web wrapper tests passed");
	return 0;
}
