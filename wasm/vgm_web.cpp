#include <math.h>
#include <new>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <string>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define VGM_WEB_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define VGM_WEB_EXPORT
#endif

#include <stdtype.h>
#include <emu/EmuStructs.h>
#include <emu/SoundEmu.h>
#include <player/playera.hpp>
#include <player/playerbase.hpp>
#include <player/vgmplayer.hpp>
#include <utils/DataLoader.h>
#include <utils/MemoryLoader.h>
#include "vgm_web.h"

#define VGM_WEB_MAX_FILE_SIZE (256U * 1024U * 1024U)

struct VGM_WEB_CHIP
{
	std::string name;
	std::string core;
	UINT32 clock;
};

struct VGM_WEB_PLAYER
{
	PlayerA player;
	DATA_LOADER* loader;
	UINT8* fileData;
	UINT32 fileSize;
	UINT32 sampleRate;
	UINT32 maxFrames;
	std::vector<INT32> pcm;
	std::vector<VGM_WEB_CHIP> chips;
	std::string lastError;
	std::string missingChip;
	std::string missingResource;
	bool loaded;
	bool paused;
	bool finished;
	bool muted;
	float volume;

	VGM_WEB_PLAYER(UINT32 rate, UINT32 frames) :
		loader(NULL),
		fileData(NULL),
		fileSize(0),
		sampleRate(rate),
		maxFrames(frames),
		pcm(frames * 2),
		loaded(false),
		paused(true),
		finished(false),
		muted(false),
		volume(1.0f)
	{
		player.RegisterPlayerEngine(new VGMPlayer);
		player.SetFileReqCallback(FileRequestCallback, this);
		player.SetLogCallback(LogCallback, this);
		player.SetOutputSettings(sampleRate, 2, 32, maxFrames);
		PlayerA::Config config = player.GetConfiguration();
		config.masterVol = 0x10000;
		config.loopCount = 1;
		config.fadeSmpls = 0;
		config.endSilenceSmpls = 0;
		config.pbSpeed = 1.0;
		player.SetConfiguration(config);
	}

	~VGM_WEB_PLAYER()
	{
		Unload();
	}

	void SetError(const char* message)
	{
		lastError = message != NULL ? message : "Unknown libvgm error";
	}

	void Unload()
	{
		chips.clear();
		missingChip.clear();
		missingResource.clear();
		lastError.clear();
		if (player.GetPlayer() != NULL)
			player.UnloadFile();
		if (loader != NULL)
		{
			DataLoader_Deinit(loader);
			loader = NULL;
		}
		free(fileData);
		fileData = NULL;
		fileSize = 0;
		loaded = false;
		paused = true;
		finished = false;
	}

	void RefreshVolume()
	{
		float gain = muted ? 0.0f : volume;
		player.SetMasterVolume((INT32)(gain * 65536.0f + 0.5f));
	}

	void RefreshChips()
	{
		std::vector<PLR_DEV_INFO> deviceInfo;
		PlayerBase* engine = player.GetPlayer();
		chips.clear();
		UINT8 deviceResult = engine != NULL ? engine->GetSongDeviceInfo(deviceInfo) : 0xFF;
		if (engine == NULL || deviceResult >= 0x80)
			return;

		for (size_t index = 0; index < deviceInfo.size(); index ++)
		{
			const PLR_DEV_INFO& info = deviceInfo[index];
			if (info.parentIdx != (UINT32)-1)
				continue;
			VGM_WEB_CHIP chip;
			const char* name = SndEmu_GetDevName(info.type, 0x01, info.devCfg);
			chip.name = name != NULL ? name : "Unknown chip";
			if (info.instance > 0 && info.instance != 0xFFFF)
			{
				char suffix[24];
				snprintf(suffix, sizeof(suffix), " #%u", (unsigned int)info.instance + 1);
				chip.name += suffix;
			}
			char core[5];
			core[0] = (char)((info.core >> 24) & 0xFF);
			core[1] = (char)((info.core >> 16) & 0xFF);
			core[2] = (char)((info.core >> 8) & 0xFF);
			core[3] = (char)(info.core & 0xFF);
			core[4] = '\0';
			for (unsigned int pos = 0; pos < 4; pos ++)
			{
				if ((unsigned char)core[pos] < 0x20)
					core[pos] = ' ';
			}
			chip.core = info.core != 0 ? core : "default";
			chip.clock = info.devCfg != NULL ? info.devCfg->clock : 0;
			chips.push_back(chip);
		}
	}

	static DATA_LOADER* FileRequestCallback(void* userParam, PlayerBase*, const char* fileName)
	{
		VGM_WEB_PLAYER* webPlayer = (VGM_WEB_PLAYER*)userParam;
		webPlayer->missingResource = fileName != NULL ? fileName : "external data";
		if (fileName != NULL && strcmp(fileName, "yrw801.rom") == 0)
			webPlayer->missingChip = "YMF278B / OPL4";
		else
			webPlayer->missingChip = "Sound chip";
		return NULL;
	}

	static void LogCallback(void* userParam, PlayerBase*, UINT8 level, UINT8,
		const char* sourceTag, const char* message)
	{
		VGM_WEB_PLAYER* webPlayer = (VGM_WEB_PLAYER*)userParam;
		if (level > PLRLOG_ERROR || message == NULL)
			return;
		if (sourceTag != NULL)
		{
			webPlayer->lastError = sourceTag;
			webPlayer->lastError += ": ";
			webPlayer->lastError += message;
		}
		else
		{
			webPlayer->lastError = message;
		}
	}
};

static VGM_WEB_PLAYER* GetPlayer(void* handle)
{
	return (VGM_WEB_PLAYER*)handle;
}

static UINT32 ReadLittleEndian32(const UINT8* data)
{
	return ((UINT32)data[0]) | ((UINT32)data[1] << 8) |
		((UINT32)data[2] << 16) | ((UINT32)data[3] << 24);
}

static const char* const MetadataNames[] =
{
	"TITLE", "TITLE-JPN", "GAME", "GAME-JPN", "SYSTEM", "SYSTEM-JPN",
	"ARTIST", "ARTIST-JPN", "DATE", "ENCODED_BY", "COMMENT"
};

extern "C"
{

VGM_WEB_EXPORT void* vgm_web_create(unsigned int sampleRate, unsigned int maxFrames)
{
	if (sampleRate < 8000 || sampleRate > 384000 || maxFrames == 0 || maxFrames > 16384)
		return NULL;
	return new (std::nothrow) VGM_WEB_PLAYER(sampleRate, maxFrames);
}

VGM_WEB_EXPORT void vgm_web_destroy(void* handle)
{
	delete GetPlayer(handle);
}

VGM_WEB_EXPORT void* vgm_web_alloc_file(unsigned int size)
{
	if (size == 0 || size > VGM_WEB_MAX_FILE_SIZE)
		return NULL;
	return malloc(size);
}

VGM_WEB_EXPORT void vgm_web_discard_file(void* data)
{
	free(data);
}

VGM_WEB_EXPORT int vgm_web_load(void* handle, void* data, unsigned int size)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	if (webPlayer == NULL || data == NULL || size < 4)
	{
		free(data);
		return VGM_WEB_ERR_INVALID_ARGUMENT;
	}
	webPlayer->Unload();
	webPlayer->fileData = (UINT8*)data;
	webPlayer->fileSize = size;
	if (size > VGM_WEB_MAX_FILE_SIZE)
	{
		webPlayer->SetError("The file exceeds the 256 MiB browser safety limit.");
		return VGM_WEB_ERR_FILE_TOO_LARGE;
	}
	if (size >= 18 && webPlayer->fileData[0] == 0x1F && webPlayer->fileData[1] == 0x8B)
	{
		UINT32 unpackedSize = ReadLittleEndian32(&webPlayer->fileData[size - 4]);
		if (unpackedSize == 0 || unpackedSize > VGM_WEB_MAX_FILE_SIZE)
		{
			webPlayer->SetError("The VGZ decompressed size is invalid or too large.");
			return VGM_WEB_ERR_DECOMPRESSION;
		}
	}
	webPlayer->loader = MemoryLoader_Init(webPlayer->fileData, size);
	if (webPlayer->loader == NULL)
	{
		webPlayer->SetError("Unable to allocate the in-memory VGM loader.");
		return VGM_WEB_ERR_OUT_OF_MEMORY;
	}
	if (DataLoader_Load(webPlayer->loader) != 0)
	{
		webPlayer->SetError("The VGM or VGZ data could not be decoded.");
		return VGM_WEB_ERR_DECOMPRESSION;
	}
	UINT8 result = webPlayer->player.LoadFile(webPlayer->loader);
	if (result != 0)
	{
		webPlayer->SetError(result == 0xFF ?
			"The data is not a supported VGM file." : "The VGM file is malformed.");
		return result == 0xFF ? VGM_WEB_ERR_UNSUPPORTED_FORMAT : VGM_WEB_ERR_INVALID_FILE;
	}
	webPlayer->loaded = true;
	if (webPlayer->player.Start() != 0)
	{
		webPlayer->SetError("A sound core failed to initialize.");
		return VGM_WEB_ERR_PLAYER_INIT;
	}
	webPlayer->paused = true;
	webPlayer->finished = false;
	webPlayer->RefreshVolume();
	webPlayer->RefreshChips();
	if (! webPlayer->missingResource.empty())
	{
		webPlayer->SetError("This VGM requires external ROM or sample data.");
		return VGM_WEB_ERR_MISSING_RESOURCE;
	}
	return VGM_WEB_OK;
}

VGM_WEB_EXPORT void vgm_web_unload(void* handle)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	if (webPlayer != NULL)
		webPlayer->Unload();
}

VGM_WEB_EXPORT int vgm_web_start(void* handle)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	if (webPlayer == NULL || ! webPlayer->loaded)
		return VGM_WEB_ERR_NOT_LOADED;
	if (webPlayer->finished)
		webPlayer->player.Reset();
	webPlayer->finished = false;
	webPlayer->paused = false;
	return VGM_WEB_OK;
}

VGM_WEB_EXPORT int vgm_web_pause(void* handle)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	if (webPlayer == NULL || ! webPlayer->loaded)
		return VGM_WEB_ERR_NOT_LOADED;
	webPlayer->paused = true;
	return VGM_WEB_OK;
}

VGM_WEB_EXPORT int vgm_web_stop(void* handle)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	if (webPlayer == NULL || ! webPlayer->loaded)
		return VGM_WEB_ERR_NOT_LOADED;
	webPlayer->player.Reset();
	webPlayer->paused = true;
	webPlayer->finished = false;
	return VGM_WEB_OK;
}

VGM_WEB_EXPORT int vgm_web_seek(void* handle, double seconds)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	if (webPlayer == NULL || ! webPlayer->loaded || ! isfinite(seconds))
		return VGM_WEB_ERR_NOT_LOADED;
	double duration = webPlayer->player.GetTotalTime(PLAYTIME_TIME_PBK);
	if (seconds < 0.0)
		seconds = 0.0;
	if (duration >= 0.0 && seconds > duration)
		seconds = duration;
	double sample = seconds * webPlayer->sampleRate;
	if (sample > 4294967295.0)
		sample = 4294967295.0;
	if (webPlayer->player.Seek(PLAYPOS_SAMPLE, (UINT32)sample) != 0)
	{
		webPlayer->SetError("libvgm could not seek to the requested position.");
		return VGM_WEB_ERR_PLAYBACK;
	}
	webPlayer->finished = false;
	return VGM_WEB_OK;
}

VGM_WEB_EXPORT double vgm_web_get_position(void* handle)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	if (webPlayer == NULL || ! webPlayer->loaded)
		return 0.0;
	double value = webPlayer->player.GetCurTime(PLAYTIME_LOOP_INCL | PLAYTIME_TIME_PBK);
	return value >= 0.0 ? value : 0.0;
}

VGM_WEB_EXPORT double vgm_web_get_duration(void* handle)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	if (webPlayer == NULL || ! webPlayer->loaded)
		return 0.0;
	double value = webPlayer->player.GetTotalTime(PLAYTIME_TIME_PBK);
	return value >= 0.0 ? value : 0.0;
}

VGM_WEB_EXPORT int vgm_web_is_finished(void* handle)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	return webPlayer != NULL && webPlayer->finished ? 1 : 0;
}

VGM_WEB_EXPORT int vgm_web_set_volume(void* handle, float volume)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	if (webPlayer == NULL || ! isfinite(volume))
		return VGM_WEB_ERR_INVALID_ARGUMENT;
	if (volume < 0.0f)
		volume = 0.0f;
	if (volume > 1.0f)
		volume = 1.0f;
	webPlayer->volume = volume;
	webPlayer->RefreshVolume();
	return VGM_WEB_OK;
}

VGM_WEB_EXPORT int vgm_web_set_mute(void* handle, int muted)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	if (webPlayer == NULL)
		return VGM_WEB_ERR_INVALID_ARGUMENT;
	webPlayer->muted = muted != 0;
	webPlayer->RefreshVolume();
	return VGM_WEB_OK;
}

VGM_WEB_EXPORT unsigned int vgm_web_render(void* handle, float* output, unsigned int frames)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	if (output == NULL || frames == 0)
		return 0;
	if (webPlayer == NULL || ! webPlayer->loaded || webPlayer->paused || webPlayer->finished)
	{
		memset(output, 0, frames * 2 * sizeof(float));
		return frames;
	}
	if (frames > webPlayer->maxFrames)
		frames = webPlayer->maxFrames;
	UINT32 renderedBytes = webPlayer->player.Render(frames * 2 * sizeof(INT32), &webPlayer->pcm[0]);
	UINT32 renderedFrames = renderedBytes / (2 * sizeof(INT32));
	for (UINT32 index = 0; index < renderedFrames * 2; index ++)
		output[index] = webPlayer->pcm[index] / 2147483648.0f;
	if (renderedFrames < frames)
		memset(&output[renderedFrames * 2], 0, (frames - renderedFrames) * 2 * sizeof(float));
	if (webPlayer->player.GetState() & PLAYSTATE_FIN)
		webPlayer->finished = true;
	return frames;
}

VGM_WEB_EXPORT const char* vgm_web_get_metadata(void* handle, int field)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	if (webPlayer == NULL || ! webPlayer->loaded || field < 0 || field >= 11)
		return "";
	PlayerBase* engine = webPlayer->player.GetPlayer();
	if (engine == NULL)
		return "";
	const char* const* tags = engine->GetTags();
	while (tags != NULL && tags[0] != NULL)
	{
		if (strcmp(tags[0], MetadataNames[field]) == 0)
			return tags[1] != NULL ? tags[1] : "";
		tags += 2;
	}
	return "";
}

VGM_WEB_EXPORT unsigned int vgm_web_get_chip_count(void* handle)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	return webPlayer != NULL ? (unsigned int)webPlayer->chips.size() : 0;
}

VGM_WEB_EXPORT const char* vgm_web_get_chip_name(void* handle, unsigned int index)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	return webPlayer != NULL && index < webPlayer->chips.size() ?
		webPlayer->chips[index].name.c_str() : "";
}

VGM_WEB_EXPORT const char* vgm_web_get_chip_core(void* handle, unsigned int index)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	return webPlayer != NULL && index < webPlayer->chips.size() ?
		webPlayer->chips[index].core.c_str() : "";
}

VGM_WEB_EXPORT unsigned int vgm_web_get_chip_clock(void* handle, unsigned int index)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	return webPlayer != NULL && index < webPlayer->chips.size() ? webPlayer->chips[index].clock : 0;
}

VGM_WEB_EXPORT const char* vgm_web_get_error(void* handle)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	return webPlayer != NULL ? webPlayer->lastError.c_str() : "Invalid player handle";
}

VGM_WEB_EXPORT const char* vgm_web_get_missing_chip(void* handle)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	return webPlayer != NULL ? webPlayer->missingChip.c_str() : "";
}

VGM_WEB_EXPORT const char* vgm_web_get_missing_resource(void* handle)
{
	VGM_WEB_PLAYER* webPlayer = GetPlayer(handle);
	return webPlayer != NULL ? webPlayer->missingResource.c_str() : "";
}

VGM_WEB_EXPORT unsigned int vgm_web_get_registered_device_count(void)
{
	unsigned int count = 0;
	while (sndEmu_Devices[count] != NULL)
		count ++;
	return count;
}

VGM_WEB_EXPORT unsigned int vgm_web_get_registered_core_count(void)
{
	unsigned int count = 0;
	for (unsigned int device = 0; sndEmu_Devices[device] != NULL; device ++)
	{
		const DEV_DEF* const* cores = sndEmu_Devices[device]->cores;
		while (cores != NULL && cores[0] != NULL)
		{
			count ++;
			cores ++;
		}
	}
	return count;
}

VGM_WEB_EXPORT int vgm_web_validate_registry(void)
{
	for (unsigned int device = 0; sndEmu_Devices[device] != NULL; device ++)
	{
		const DEV_DECL* declaration = sndEmu_Devices[device];
		if (declaration->name == NULL)
			return -(int)(1000 + device);
		if (declaration->cores[0] == NULL)
			continue;
		for (unsigned int core = 0; declaration->cores[core] != NULL; core ++)
		{
			const DEV_DEF* definition = declaration->cores[core];
			if (definition->name == NULL)
				return -(int)(3000 + device * 100 + core);
			if (definition->Start == NULL)
				return -(int)(4000 + device * 100 + core);
		}
	}
	return 1;
}

}
