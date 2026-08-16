#include <stdlib.h>
#include <string.h>

#include <stdtype.h>
#include <utils/StrUtils.h>

struct _codepage_conversion
{
	UINT8 reserved;
};

static UINT16 ReadUtf16(const UINT8* data)
{
	return (UINT16)(data[0] | (data[1] << 8));
}

static size_t WriteUtf8(char* output, UINT32 codepoint)
{
	if (codepoint <= 0x7F)
	{
		output[0] = (char)codepoint;
		return 1;
	}
	if (codepoint <= 0x7FF)
	{
		output[0] = (char)(0xC0 | (codepoint >> 6));
		output[1] = (char)(0x80 | (codepoint & 0x3F));
		return 2;
	}
	if (codepoint <= 0xFFFF)
	{
		output[0] = (char)(0xE0 | (codepoint >> 12));
		output[1] = (char)(0x80 | ((codepoint >> 6) & 0x3F));
		output[2] = (char)(0x80 | (codepoint & 0x3F));
		return 3;
	}
	output[0] = (char)(0xF0 | (codepoint >> 18));
	output[1] = (char)(0x80 | ((codepoint >> 12) & 0x3F));
	output[2] = (char)(0x80 | ((codepoint >> 6) & 0x3F));
	output[3] = (char)(0x80 | (codepoint & 0x3F));
	return 4;
}

UINT8 CPConv_Init(CPCONV** retCPC, const char* cpFrom, const char* cpTo)
{
	if (retCPC == NULL || cpFrom == NULL || cpTo == NULL ||
		strcmp(cpFrom, "UTF-16LE") != 0 || strcmp(cpTo, "UTF-8") != 0)
		return 0x80;
	*retCPC = (CPCONV*)calloc(1, sizeof(CPCONV));
	return *retCPC != NULL ? 0x00 : 0xFF;
}

void CPConv_Deinit(CPCONV* cpc)
{
	free(cpc);
}

UINT8 CPConv_StrConvert(CPCONV* cpc, size_t* outSize, char** outStr,
	size_t inSize, const char* inStr)
{
	const UINT8* input;
	char* output;
	size_t inputPos;
	size_t outputPos;
	size_t outputCapacity;
	UINT8 allocated;
	UINT8 result;

	if (cpc == NULL || outSize == NULL || outStr == NULL || inStr == NULL)
		return 0xFF;
	if (inSize == 0)
	{
		const UINT8* scan = (const UINT8*)inStr;
		while (ReadUtf16(scan + inSize) != 0)
			inSize += 2;
		inSize += 2;
	}
	input = (const UINT8*)inStr;
	allocated = *outStr == NULL;
	if (allocated)
	{
		outputCapacity = inSize * 2 + 1;
		*outStr = (char*)malloc(outputCapacity);
		if (*outStr == NULL)
			return 0xFF;
	}
	else
	{
		outputCapacity = *outSize;
	}
	output = *outStr;
	inputPos = 0;
	outputPos = 0;
	result = 0x00;
	while (inputPos + 1 < inSize)
	{
		UINT16 first = ReadUtf16(input + inputPos);
		UINT32 codepoint;
		size_t required;
		inputPos += 2;
		if (first == 0)
			break;
		if (first >= 0xD800 && first <= 0xDBFF && inputPos + 1 < inSize)
		{
			UINT16 second = ReadUtf16(input + inputPos);
			if (second >= 0xDC00 && second <= 0xDFFF)
			{
				codepoint = 0x10000 + (((UINT32)first - 0xD800) << 10) + ((UINT32)second - 0xDC00);
				inputPos += 2;
			}
			else
			{
				codepoint = 0xFFFD;
				result = 0x01;
			}
		}
		else if (first >= 0xD800 && first <= 0xDFFF)
		{
			codepoint = 0xFFFD;
			result = 0x01;
		}
		else
		{
			codepoint = first;
		}
		required = codepoint <= 0x7F ? 1 : codepoint <= 0x7FF ? 2 : codepoint <= 0xFFFF ? 3 : 4;
		if (outputPos + required > outputCapacity)
		{
			result = 0x10;
			break;
		}
		outputPos += WriteUtf8(output + outputPos, codepoint);
	}
	*outSize = outputPos;
	return result;
}
