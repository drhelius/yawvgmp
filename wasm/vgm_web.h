#ifndef __VGM_WEB_H__
#define __VGM_WEB_H__

#include <stddef.h>

#ifdef __cplusplus
extern "C"
{
#endif

enum VGM_WEB_ERROR
{
	VGM_WEB_OK = 0,
	VGM_WEB_ERR_INVALID_ARGUMENT = 1,
	VGM_WEB_ERR_OUT_OF_MEMORY = 2,
	VGM_WEB_ERR_FILE_TOO_LARGE = 3,
	VGM_WEB_ERR_DECOMPRESSION = 4,
	VGM_WEB_ERR_UNSUPPORTED_FORMAT = 5,
	VGM_WEB_ERR_INVALID_FILE = 6,
	VGM_WEB_ERR_PLAYER_INIT = 7,
	VGM_WEB_ERR_NOT_LOADED = 8,
	VGM_WEB_ERR_MISSING_RESOURCE = 9,
	VGM_WEB_ERR_PLAYBACK = 10
};

enum VGM_WEB_METADATA
{
	VGM_WEB_META_TITLE = 0,
	VGM_WEB_META_TITLE_JAPANESE,
	VGM_WEB_META_GAME,
	VGM_WEB_META_GAME_JAPANESE,
	VGM_WEB_META_SYSTEM,
	VGM_WEB_META_SYSTEM_JAPANESE,
	VGM_WEB_META_ARTIST,
	VGM_WEB_META_ARTIST_JAPANESE,
	VGM_WEB_META_DATE,
	VGM_WEB_META_ENCODER,
	VGM_WEB_META_COMMENT
};

void* vgm_web_create(unsigned int sample_rate, unsigned int max_frames);
void vgm_web_destroy(void* handle);
void* vgm_web_alloc_file(unsigned int size);
void vgm_web_discard_file(void* data);
int vgm_web_load(void* handle, void* data, unsigned int size);
void vgm_web_unload(void* handle);
int vgm_web_start(void* handle);
int vgm_web_pause(void* handle);
int vgm_web_stop(void* handle);
int vgm_web_seek(void* handle, double seconds);
double vgm_web_get_position(void* handle);
double vgm_web_get_duration(void* handle);
int vgm_web_is_finished(void* handle);
int vgm_web_set_volume(void* handle, float volume);
int vgm_web_set_mute(void* handle, int muted);
unsigned int vgm_web_render(void* handle, float* output, unsigned int frames);
const char* vgm_web_get_metadata(void* handle, int field);
unsigned int vgm_web_get_chip_count(void* handle);
const char* vgm_web_get_chip_name(void* handle, unsigned int index);
const char* vgm_web_get_chip_core(void* handle, unsigned int index);
unsigned int vgm_web_get_chip_clock(void* handle, unsigned int index);
const char* vgm_web_get_error(void* handle);
const char* vgm_web_get_missing_chip(void* handle);
const char* vgm_web_get_missing_resource(void* handle);
unsigned int vgm_web_get_registered_device_count(void);
unsigned int vgm_web_get_registered_core_count(void);
int vgm_web_validate_registry(void);

#ifdef __cplusplus
}
#endif

#endif
